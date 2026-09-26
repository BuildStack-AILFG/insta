"""Razorpay billing (orders, verification, proration, GST invoices, lapse), payment links, the sales pipeline and the public site forms."""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select, update

from app.core.config import get_settings
from app.models.billing import Payment
from app.models.tenant import Tenant
from app.services import billing, razorpay, scheduler
from tests.conftest import db_session, texts  # noqa: F401

KEY_ID, KEY_SECRET, WEBHOOK_SECRET = "rzp_test_platform", "platform-secret", "whsec-platform"
SELLER_GSTIN = "27ABCDE1234F1Z5"  # Maharashtra
BUYER_GSTIN_MH, BUYER_GSTIN_KA = "27AAPFU0939F1ZV", "29AAACH7409R1ZX"
OWN_KEYS = ("rzp_test_workspace", "workspace-secret")


class FakeRazorpay:
    """Stands in for api.razorpay.com: orders, payments, payment links and credential checks."""

    def __init__(self):
        self.calls: list[dict] = []
        self.orders: dict[str, dict] = {}
        self.payments: dict[str, dict] = {}
        self.links: dict[str, dict] = {}
        self._n = 0

    def reset(self):
        self.calls.clear(), self.orders.clear(), self.payments.clear(), self.links.clear()

    def handler(self, request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else {}
        self.calls.append({"method": request.method, "path": request.url.path, "body": body, "auth": request.headers.get("authorization", "")})
        import base64
        try:
            key_id, secret = base64.b64decode(request.headers["authorization"].split()[1]).decode().split(":", 1)
        except Exception:  # noqa: BLE001
            return httpx.Response(401, json={"error": {"code": "BAD_REQUEST_ERROR", "description": "Authentication failed"}})
        if (key_id, secret) not in {(KEY_ID, KEY_SECRET), OWN_KEYS}:
            return httpx.Response(401, json={"error": {"code": "BAD_REQUEST_ERROR", "description": "The api key provided is invalid"}})
        path, m = request.url.path, request.method
        self._n += 1
        if m == "POST" and path == "/v1/orders":
            oid = f"order_{self._n:04d}"
            self.orders[oid] = {"id": oid, "amount": body["amount"], "currency": body["currency"], "notes": body.get("notes", {}), "status": "created"}
            return httpx.Response(200, json=self.orders[oid])
        if m == "GET" and (mm := re.fullmatch(r"/v1/payments/(\w+)", path)):
            p = self.payments.get(mm.group(1))
            return httpx.Response(200, json=p) if p else httpx.Response(400, json={"error": {"description": "not found"}})
        if m == "POST" and (mm := re.fullmatch(r"/v1/payments/(\w+)/capture", path)):
            self.payments[mm.group(1)]["status"] = "captured"
            return httpx.Response(200, json=self.payments[mm.group(1)])
        if m == "GET" and path == "/v1/payments":
            return httpx.Response(200, json={"items": []})
        if m == "POST" and path == "/v1/payment_links":
            lid = f"plink_{self._n:04d}"
            self.links[lid] = {"id": lid, "short_url": f"https://rzp.io/i/{lid}", "status": "created", "amount": body["amount"], "reference_id": body["reference_id"], "body": body}
            return httpx.Response(200, json=self.links[lid])
        if m == "GET" and (mm := re.fullmatch(r"/v1/payment_links/(\w+)", path)):
            return httpx.Response(200, json=self.links[mm.group(1)])
        if m == "POST" and (mm := re.fullmatch(r"/v1/payment_links/(\w+)/cancel", path)):
            self.links[mm.group(1)]["status"] = "cancelled"
            return httpx.Response(200, json=self.links[mm.group(1)])
        return httpx.Response(404, json={"error": {"description": f"unhandled fake route {m} {path}"}})

    def pay(self, order_id: str, payment_id: str | None = None, method: str = "upi", status: str = "captured") -> dict:
        """The customer completes Checkout: returns what the browser posts back to /billing/verify."""
        payment_id = payment_id or f"pay_{uuid.uuid4().hex[:14]}"
        self.payments[payment_id] = {"id": payment_id, "order_id": order_id, "amount": self.orders[order_id]["amount"], "method": method, "status": status}
        sig = hmac.new(KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
        return {"razorpay_order_id": order_id, "razorpay_payment_id": payment_id, "razorpay_signature": sig}


@pytest.fixture(scope="module")
def rzp():
    fake = FakeRazorpay()
    client = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
    razorpay._http_factory = lambda: client
    s = get_settings()
    saved = {k: getattr(s, k) for k in ("razorpay_key_id", "razorpay_key_secret", "razorpay_webhook_secret", "company_gstin", "company_address", "company_email")}
    s.razorpay_key_id, s.razorpay_key_secret, s.razorpay_webhook_secret = KEY_ID, KEY_SECRET, WEBHOOK_SECRET
    s.company_gstin, s.company_address, s.company_email = SELLER_GSTIN, "1 Test Street, Pune", "billing@scaledesk.test"
    yield fake
    for k, v in saved.items():
        setattr(s, k, v)
    razorpay._http_factory = None


@pytest.fixture(autouse=True)
def _rzp_reset(rzp):
    rzp.reset()


PROFILE = {"legal_name": "Acme Traders Pvt Ltd", "gstin": BUYER_GSTIN_MH, "address": "12 MG Road", "city": "Mumbai", "pincode": "400001", "email": "accounts@acme.test", "phone": "9876543210"}


async def buy(ws, rzp, plan="starter", interval="monthly", pay_id=None) -> dict:
    r = await ws.post("/billing/checkout", json={"plan_id": plan, "interval": interval})
    assert r.status_code == 200, r.text
    co = r.json()
    v = await ws.post("/billing/verify", json=rzp.pay(co["order_id"], pay_id))
    assert v.status_code == 200, v.text
    return v.json()["payment"]


async def tenant_row(ws) -> Tenant:
    async with await db_session() as db:
        return await db.get(Tenant, uuid.UUID(ws.tenant_id))


# ---- plans, quotes, checkout ------------------------------------------------------------------------------------------------------

async def test_overview_lists_purchasable_plans_with_gst_quotes(ws, rzp):
    o = (await ws.get("/billing")).json()
    assert o["enabled"] and o["key_id"] == KEY_ID and o["gst_percent"] == 18 and o["plan"]["kind"] == "trial"
    starter = next(p for p in o["plans"] if p["id"] == "starter")
    q = starter["quotes"]["quarterly"]
    assert q["base"] == 71900 * 3 and q["gst"] == round(q["base"] * 0.18) and q["total"] == q["base"] + q["gst"] and q["months"] == 3
    assert {"free", "trial"}.isdisjoint({p["id"] for p in o["plans"]})
    assert not next(p for p in o["plans"] if p["id"] == "enterprise")["purchasable"]


async def test_checkout_needs_billing_details_and_validates_gstin(ws, rzp):
    r = await ws.post("/billing/checkout", json={"plan_id": "starter", "interval": "monthly"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "billing_profile"
    assert (await ws.put("/billing/profile", json={**PROFILE, "gstin": "NOTAGSTIN"})).status_code == 422
    ok = await ws.put("/billing/profile", json=PROFILE)
    assert ok.status_code == 200 and ok.json()["state_code"] == "27"  # derived from the GSTIN
    assert (await ws.post("/billing/checkout", json={"plan_id": "enterprise", "interval": "monthly"})).status_code == 422
    assert (await ws.post("/billing/checkout", json={"plan_id": "starter", "interval": "weekly"})).status_code == 422
    assert (await ws.post("/billing/checkout", json={"plan_id": "nope", "interval": "monthly"})).status_code == 422


async def test_pay_activates_plan_and_issues_a_gst_invoice(ws, rzp):
    await ws.put("/billing/profile", json=PROFILE)
    pay = await buy(ws, rzp, "starter", "quarterly")
    assert pay["status"] == "paid" and pay["total_amount"] == round(71900 * 3 * 1.18) and pay["method"] == "upi"
    assert re.fullmatch(r"SD/\d{4}-\d{2}/\d{5}", pay["invoice_number"])
    t = await tenant_row(ws)
    assert t.plan_id == "starter" and 88 <= (t.plan_expires_at - datetime.now(timezone.utc)).days <= 92
    o = (await ws.get("/billing")).json()
    assert o["plan"]["kind"] == "active" and o["plan"]["days_left"] >= 88 and o["payments"][0]["id"] == pay["id"]
    assert (await ws.get("/workspace")).json()["plan"]["id"] == "starter"  # quotas follow the plan

    inv = (await ws.get(f"/billing/invoices/{pay['id']}")).json()
    a = inv["amounts"]
    assert inv["number"] == pay["invoice_number"] and inv["seller"]["gstin"] == SELLER_GSTIN and inv["buyer"]["legal_name"] == PROFILE["legal_name"]
    assert a["cgst"] + a["sgst"] == a["gst"] and a["igst"] == 0 and a["taxable"] + a["gst"] == a["total"]  # both in Maharashtra -> CGST + SGST


async def test_inter_state_invoice_uses_igst(ws, rzp):
    await ws.put("/billing/profile", json={**PROFILE, "gstin": BUYER_GSTIN_KA})
    pay = await buy(ws, rzp)
    a = (await ws.get(f"/billing/invoices/{pay['id']}")).json()["amounts"]
    assert a["igst"] == a["gst"] > 0 and a["cgst"] == a["sgst"] == 0


async def test_invoice_numbers_are_sequential_and_verify_is_idempotent(ws, rzp):
    await ws.put("/billing/profile", json=PROFILE)
    first = await buy(ws, rzp, pay_id="pay_ONE")
    co = (await ws.post("/billing/checkout", json={"plan_id": "starter", "interval": "monthly"})).json()
    body = rzp.pay(co["order_id"], "pay_TWO")
    second = (await ws.post("/billing/verify", json=body)).json()["payment"]
    again = (await ws.post("/billing/verify", json=body)).json()["payment"]
    assert again["invoice_number"] == second["invoice_number"]
    n = lambda p: int(p["invoice_number"].rsplit("/", 1)[1])  # noqa: E731
    assert n(second) == n(first) + 1
    assert len((await ws.get("/billing/payments")).json()) == 2


async def test_renewal_extends_from_the_current_expiry(ws, rzp):
    await ws.put("/billing/profile", json=PROFILE)
    await buy(ws, rzp, "starter", "monthly", "pay_R1")
    first_end = (await tenant_row(ws)).plan_expires_at
    q = (await ws.post("/billing/quote", json={"plan_id": "starter", "interval": "monthly"})).json()
    assert q["renewal"] and q["credit"] == 0
    await buy(ws, rzp, "starter", "monthly", "pay_R2")
    second_end = (await tenant_row(ws)).plan_expires_at
    assert 27 <= (second_end - first_end).days <= 31


async def test_upgrade_credits_the_unused_part_of_the_current_plan(ws, rzp):
    await ws.put("/billing/profile", json=PROFILE)
    await buy(ws, rzp, "starter", "monthly")
    q = (await ws.post("/billing/quote", json={"plan_id": "growth", "interval": "monthly"})).json()
    assert not q["renewal"] and 70000 < q["credit"] <= 79900  # almost all of the starter month is unused
    assert q["taxable"] == q["base"] - q["credit"] and q["gst"] == round(q["taxable"] * 0.18)
    pay = await buy(ws, rzp, "growth", "monthly", "pay_UP")
    assert pay["credit_amount"] == pytest.approx(q["credit"], abs=200) and (await tenant_row(ws)).plan_id == "growth"


async def test_bad_signature_and_foreign_orders_are_rejected(ws, other, rzp):
    await ws.put("/billing/profile", json=PROFILE)
    co = (await ws.post("/billing/checkout", json={"plan_id": "starter", "interval": "monthly"})).json()
    good = rzp.pay(co["order_id"])
    assert (await ws.post("/billing/verify", json={**good, "razorpay_signature": "0" * 64})).status_code == 400
    assert (await other.post("/billing/verify", json=good)).status_code == 404  # someone else's order
    assert (await tenant_row(ws)).plan_id == "trial"
    assert (await ws.post("/billing/verify", json=good)).status_code == 200


async def test_amount_mismatch_is_rejected(ws, rzp):
    await ws.put("/billing/profile", json=PROFILE)
    co = (await ws.post("/billing/checkout", json={"plan_id": "starter", "interval": "monthly"})).json()
    body = rzp.pay(co["order_id"])
    rzp.payments[body["razorpay_payment_id"]]["amount"] = 100
    assert (await ws.post("/billing/verify", json=body)).status_code == 400
    assert (await tenant_row(ws)).plan_id == "trial"


async def test_authorized_payments_are_captured(ws, rzp):
    await ws.put("/billing/profile", json=PROFILE)
    co = (await ws.post("/billing/checkout", json={"plan_id": "starter", "interval": "monthly"})).json()
    assert (await ws.post("/billing/verify", json=rzp.pay(co["order_id"], status="authorized"))).status_code == 200
    assert any(c["path"].endswith("/capture") for c in rzp.calls)


async def test_webhook_activates_when_the_browser_never_calls_back(ws, app_client, rzp):
    await ws.put("/billing/profile", json=PROFILE)
    co = (await ws.post("/billing/checkout", json={"plan_id": "growth", "interval": "yearly"})).json()
    payload = {"event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_HOOK", "order_id": co["order_id"], "amount": co["amount"], "method": "card"}}}}
    raw = json.dumps(payload).encode()
    sig = hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    bad = await app_client.post("/api/billing/webhook", content=raw, headers={"x-razorpay-signature": "nope"})
    assert bad.status_code == 401 and (await tenant_row(ws)).plan_id == "trial"
    ok = await app_client.post("/api/billing/webhook", content=raw, headers={"x-razorpay-signature": sig})
    assert ok.status_code == 200 and ok.json()["activated"]
    t = await tenant_row(ws)
    assert t.plan_id == "growth" and (t.plan_expires_at - datetime.now(timezone.utc)).days >= 360
    assert (await app_client.post("/api/billing/webhook", content=raw, headers={"x-razorpay-signature": sig})).json().get("activated") is None  # replay is a no-op
    async with await db_session() as db:
        assert len((await db.execute(select(Payment).where(Payment.razorpay_payment_id == "pay_HOOK"))).scalars().all()) == 1


async def test_billing_is_manager_only_and_isolated(ws, other, rzp):
    await ws.put("/billing/profile", json=PROFILE)
    pay = await buy(ws, rzp)
    assert (await other.get(f"/billing/invoices/{pay['id']}")).status_code == 404
    assert (await other.get("/billing/payments")).json() == []
    # billing details are server-owned settings: not visible or writable through /settings
    assert "billing" not in (await ws.get("/settings")).json()["settings"]
    assert (await ws.patch("/settings", json={"settings": {"billing": {"profile": {}}}})).status_code == 422


async def test_lapsed_plans_and_trials_fall_back_to_free_and_owners_are_reminded(ws, other, rzp, monkeypatch):
    await ws.put("/billing/profile", json=PROFILE)
    await buy(ws, rzp)
    soon = datetime.now(timezone.utc) + timedelta(days=3)
    async with await db_session() as db:
        await db.execute(update(Tenant).where(Tenant.id == uuid.UUID(ws.tenant_id)).values(plan_expires_at=soon))
        await db.execute(update(Tenant).where(Tenant.id == uuid.UUID(other.tenant_id)).values(trial_ends_at=datetime.now(timezone.utc) - timedelta(days=1)))
        await db.commit()
    sent = []

    async def fake_send(to, subject, html):
        sent.append((to, subject))
        return True
    monkeypatch.setattr(billing.mailer, "enabled", lambda: True)
    monkeypatch.setattr(billing.mailer, "send", fake_send)
    out = await billing.housekeeping()
    assert out["trial_ended"] >= 1 and (await tenant_row(other)).plan_id == "free"
    assert (await tenant_row(ws)).plan_id == "starter" and any(ws.email == to and "ends soon" in s for to, s in sent)
    before = len(sent)
    await billing.housekeeping()
    assert len(sent) == before  # one reminder per period

    async with await db_session() as db:
        await db.execute(update(Tenant).where(Tenant.id == uuid.UUID(ws.tenant_id)).values(plan_expires_at=datetime.now(timezone.utc) - timedelta(days=3)))
        await db.commit()
    assert (await billing.housekeeping())["plan_lapsed"] >= 1
    assert (await tenant_row(ws)).plan_id == "free"
    tick = await scheduler.tick()
    assert "payment_links" in tick


async def test_payments_disabled_without_platform_keys(ws, rzp):
    s = get_settings()
    s.razorpay_key_id = ""
    try:
        assert (await ws.get("/billing")).json()["enabled"] is False
        await ws.put("/billing/profile", json=PROFILE)
        r = await ws.post("/billing/checkout", json={"plan_id": "starter", "interval": "monthly"})
        assert r.status_code == 503
    finally:
        s.razorpay_key_id = KEY_ID


# ---- payment links (the workspace's own Razorpay account) ---------------------------------------------------------------------------------

@pytest.mark.paid
async def test_payment_links_end_to_end(wsa, rzp):
    assert (await wsa.get("/payments/settings")).json()["connected"] is False
    assert (await wsa.post("/payments/links", json={"amount": 50000})).status_code == 409  # not connected yet
    assert (await wsa.put("/payments/settings", json={"key_id": "rzp_test_wrong", "key_secret": "x"})).status_code == 422
    st = (await wsa.put("/payments/settings", json={"key_id": OWN_KEYS[0], "key_secret": OWN_KEYS[1]})).json()
    assert st["connected"] and st["test_mode"] and "secret" not in json.dumps(st).lower().replace("key_secret", "")
    assert not any(i["provider"] == "razorpay-payments" for i in (await wsa.get("/integrations")).json())  # keys never show as an integration

    await wsa.inbound("hi", from_="909811112222", name="Asha Rao")
    contact = (await wsa.get("/contacts")).json()["items"][0]
    assert (await wsa.patch(f"/contacts/{contact['id']}", json={"phone": "919811112222"})).status_code == 200  # e.g. collected in the DM
    deal = (await wsa.post("/pipeline/deals", json={"title": "Asha - annual plan", "contact_id": contact["id"], "value": 500000})).json()
    r = await wsa.post("/payments/links", json={"amount": 500000, "description": "Annual plan", "contact_id": contact["id"], "deal_id": deal["id"]})
    assert r.status_code == 201, r.text
    link = r.json()
    assert link["short_url"].startswith("https://rzp.io/") and link["status"] == "created" and link["contact_name"] == "Asha Rao"
    sent_body = next(iter(rzp.links.values()))["body"]
    assert sent_body["amount"] == 500000 and sent_body["customer"]["contact"] == "+919811112222" and sent_body["customer"]["name"] == "Asha Rao"

    assert (await wsa.get("/payments/links")).json()[0]["id"] == link["id"]
    assert (await wsa.post(f"/payments/links/{link['id']}/refresh")).json()["status"] == "created"
    rzp.links[next(iter(rzp.links))]["status"] = "paid"
    assert (await wsa.post(f"/payments/links/{link['id']}/refresh")).json()["status"] == "paid"
    acts = (await wsa.get(f"/pipeline/deals/{deal['id']}")).json()["activity"]
    assert any(a["kind"] == "payment" and a["data"]["amount"] == 500000 for a in acts)
    assert (await wsa.post(f"/payments/links/{link['id']}/cancel")).status_code == 409  # already paid

    assert (await wsa.delete("/payments/settings")).status_code == 204
    assert (await wsa.get("/payments/settings")).json()["connected"] is False


@pytest.mark.paid
async def test_payment_link_paid_via_the_workspace_webhook_and_poller(wsa, app_client, rzp):
    await wsa.put("/payments/settings", json={"key_id": OWN_KEYS[0], "key_secret": OWN_KEYS[1]})
    integ = (await wsa.put("/integrations/razorpay", json={"secret": "hook-secret"})).json()
    a = (await wsa.post("/payments/links", json={"amount": 10000, "description": "A"})).json()
    b = (await wsa.post("/payments/links", json={"amount": 20000, "description": "B"})).json()
    plink_a = next(k for k, v in rzp.links.items() if v["amount"] == 10000)
    payload = {"event": "payment_link.paid", "payload": {"payment_link": {"entity": {"id": plink_a}}, "payment": {"entity": {"id": "pay_1", "amount": 10000}}}}
    raw = json.dumps(payload).encode()
    sig = hmac.new(b"hook-secret", raw, hashlib.sha256).hexdigest()
    r = await app_client.post(integ["hook_url"].replace("https://api.test", ""), content=raw, headers={"x-razorpay-signature": sig})
    assert r.status_code == 200 and r.json()["payment_link_paid"] is True
    assert next(x for x in (await wsa.get("/payments/links")).json() if x["id"] == a["id"])["status"] == "paid"

    # the poller catches links whose webhook never arrived
    rzp.links[next(k for k, v in rzp.links.items() if v["amount"] == 20000)]["status"] = "paid"
    async with await db_session() as db:
        from app.models.billing import PaymentLink
        await db.execute(update(PaymentLink).where(PaymentLink.status == "created").values(updated_at=datetime.now(timezone.utc) - timedelta(hours=1)))
        await db.commit()
    from app.services import payment_links
    assert await payment_links.poll_open_links() == 1
    assert next(x for x in (await wsa.get("/payments/links")).json() if x["id"] == b["id"])["status"] == "paid"


async def test_payment_links_are_tenant_scoped(wsa, other, rzp):
    await wsa.put("/payments/settings", json={"key_id": OWN_KEYS[0], "key_secret": OWN_KEYS[1]})
    link = (await wsa.post("/payments/links", json={"amount": 10000})).json()
    assert (await other.post(f"/payments/links/{link['id']}/refresh")).status_code == 404
    assert (await other.get("/payments/links")).json() == []
    assert (await other.post("/payments/links", json={"amount": 10000})).status_code == 409  # other hasn't connected keys


# ---- pipeline ------------------------------------------------------------------------------------------------------------------------------

async def test_pipeline_starts_with_default_stages_and_board(ws):
    stages = (await ws.get("/pipeline/stages")).json()
    assert [s["kind"] for s in stages] == ["open", "open", "open", "open", "won", "lost"] and stages[0]["name"] == "New lead"
    board = (await ws.get("/pipeline/board")).json()
    assert len(board["stages"]) == 6 and all(s["count"] == 0 and s["deals"] == [] for s in board["stages"])


async def test_deal_lifecycle_move_won_lost_reopen_and_activity(ws):
    stages = {s["name"]: s["id"] for s in (await ws.get("/pipeline/stages")).json()}
    d = (await ws.post("/pipeline/deals", json={"title": "Acme rollout", "value": 1200000, "notes": "big one"})).json()
    assert d["status"] == "open" and d["stage_id"] == stages["New lead"] and d["activity"][0]["kind"] == "created"

    moved = (await ws.post(f"/pipeline/deals/{d['id']}/move", json={"stage_id": stages["Qualified"]})).json()
    assert moved["stage_id"] == stages["Qualified"] and moved["status"] == "open"
    won = (await ws.post(f"/pipeline/deals/{d['id']}/move", json={"stage_id": stages["Won"]})).json()
    assert won["status"] == "won" and won["closed_at"] and {a["kind"] for a in won["activity"]} >= {"created", "stage_changed", "won"}
    lost = (await ws.post(f"/pipeline/deals/{d['id']}/move", json={"stage_id": stages["Lost"], "lost_reason": "Budget"})).json()
    assert lost["status"] == "lost" and lost["lost_reason"] == "Budget"
    back = (await ws.post(f"/pipeline/deals/{d['id']}/move", json={"stage_id": stages["Contacted"]})).json()
    assert back["status"] == "open" and back["closed_at"] is None and back["lost_reason"] is None and back["activity"][0]["kind"] == "reopened"

    assert (await ws.post(f"/pipeline/deals/{d['id']}/notes", json={"text": "Called, sending quote"})).status_code == 201
    upd = (await ws.patch(f"/pipeline/deals/{d['id']}", json={"value": 900000, "title": "Acme rollout v2"})).json()
    assert upd["value"] == 900000 and upd["activity"][0]["kind"] == "updated"
    assert (await ws.patch(f"/pipeline/deals/{d['id']}", json={"value": -5})).status_code == 422
    assert (await ws.delete(f"/pipeline/deals/{d['id']}")).status_code == 204
    assert (await ws.get(f"/pipeline/deals/{d['id']}")).status_code == 404


async def test_dragging_reorders_the_column(ws):
    first = (await ws.get("/pipeline/stages")).json()[0]["id"]
    ids = [(await ws.post("/pipeline/deals", json={"title": t, "stage_id": first})).json()["id"] for t in ("A", "B", "C")]
    await ws.post(f"/pipeline/deals/{ids[2]}/move", json={"stage_id": first, "position": 0})  # C to the top
    col = (await ws.get("/pipeline/board")).json()["stages"][0]
    assert [d["title"] for d in col["deals"]] == ["C", "A", "B"] and [d["position"] for d in col["deals"]] == [0, 1, 2]
    assert col["count"] == 3


async def test_board_search_and_filters_and_export(ws):
    await ws.inbound("hi", from_="909822200001", name="Meera Shah") if hasattr(ws, "account") and ws.account else None
    a = (await ws.post("/pipeline/deals", json={"title": "Hospital chain", "value": 100})).json()
    (await ws.post("/pipeline/deals", json={"title": "=cmd|' /C calc'!A0", "value": 200}))
    assert [d["title"] for d in (await ws.get("/pipeline/board", params={"q": "hospital"})).json()["stages"][0]["deals"]] == ["Hospital chain"]
    assert (await ws.get("/pipeline/deals", params={"status": "open"})).json()["total"] == 2
    assert (await ws.get("/pipeline/deals", params={"owner": ws.user_id})).json()["total"] == 0
    csv_text = (await ws.get("/pipeline/export.csv")).text
    assert "Hospital chain" in csv_text and "'=cmd" in csv_text and a["id"]  # formula cells are neutralised


async def test_stage_management_rules(ws):
    stages = (await ws.get("/pipeline/stages")).json()
    new = (await ws.post("/pipeline/stages", json={"name": "Negotiation", "color": "#0ea5e9", "probability": 60})).json()
    names = [s["name"] for s in (await ws.get("/pipeline/stages")).json()]
    assert names.index("Negotiation") < names.index("Won")  # open stages slot in before the closed ones
    assert (await ws.post("/pipeline/stages", json={"name": "x", "color": "red"})).status_code == 422
    assert (await ws.patch(f"/pipeline/stages/{new['id']}", json={"name": "Negotiating", "probability": 65})).json()["name"] == "Negotiating"

    deal = (await ws.post("/pipeline/deals", json={"title": "Stuck", "stage_id": new["id"]})).json()
    assert (await ws.delete(f"/pipeline/stages/{new['id']}")).status_code == 409  # has a deal
    assert (await ws.delete(f"/pipeline/stages/{new['id']}", params={"move_to": stages[0]["id"]})).status_code == 204
    assert (await ws.get(f"/pipeline/deals/{deal['id']}")).json()["stage_id"] == stages[0]["id"]

    won_id = next(s["id"] for s in stages if s["kind"] == "won")
    assert (await ws.delete(f"/pipeline/stages/{won_id}")).status_code == 422  # the only Won stage
    assert (await ws.patch(f"/pipeline/stages/{won_id}", json={"kind": "open"})).status_code == 422
    order = [s["id"] for s in reversed((await ws.get("/pipeline/stages")).json())]
    assert [s["id"] for s in (await ws.put("/pipeline/stages/order", json={"ids": order})).json()] == order
    assert (await ws.put("/pipeline/stages/order", json={"ids": order[:-1]})).status_code == 422


async def test_pipeline_is_tenant_scoped_and_validates_references(ws, other):
    d = (await ws.post("/pipeline/deals", json={"title": "Mine"})).json()
    other_stage = (await other.get("/pipeline/stages")).json()[0]["id"]
    for call in (other.get(f"/pipeline/deals/{d['id']}"), other.patch(f"/pipeline/deals/{d['id']}", json={"title": "x"}), other.delete(f"/pipeline/deals/{d['id']}"),
                 other.post(f"/pipeline/deals/{d['id']}/move", json={"stage_id": other_stage})):
        assert (await call).status_code == 404
    mine_stage = (await ws.get("/pipeline/stages")).json()[0]["id"]
    assert (await ws.post("/pipeline/deals", json={"title": "x", "stage_id": other_stage})).status_code == 404
    assert (await ws.post(f"/pipeline/deals/{d['id']}/move", json={"stage_id": other_stage})).status_code == 404
    assert (await ws.post("/pipeline/deals", json={"title": "x", "stage_id": mine_stage, "contact_id": "00000000-0000-0000-0000-000000000000"})).status_code == 404
    assert (await ws.post("/pipeline/deals", json={"title": "x", "owner_user_id": other.user_id})).status_code == 422  # not on this workspace
    assert (await other.get("/pipeline/deals")).json()["total"] == 0


@pytest.mark.paid
async def test_report_numbers(ws):
    st = {s["name"]: s["id"] for s in (await ws.get("/pipeline/stages")).json()}
    mk = lambda title, value, stage: ws.post("/pipeline/deals", json={"title": title, "value": value, "stage_id": st[stage]})  # noqa: E731
    for args in (("a", 100000, "New lead"), ("b", 200000, "Qualified"), ("c", 300000, "Won"), ("d", 100000, "Won"), ("e", 400000, "Lost")):
        assert (await mk(*args)).status_code == 201
    r = (await ws.get("/pipeline/report", params={"days": 7})).json()
    assert r["open"] == {"count": 2, "value": 300000, "weighted": int(100000 * 0.10 + 200000 * 0.50)}
    assert r["won"] == {"count": 2, "value": 400000, "avg_value": 200000} and r["lost"]["count"] == 1 and r["win_rate"] == pytest.approx(66.7, abs=0.1)
    assert sum(d["won_value"] for d in r["series"]) == 400000 and len(r["series"]) == 7 and r["created"] == 5
    assert r["by_owner"][0]["won_count"] == 0 or r["by_owner"][0]["won_value"] == 400000
    assert r["lost_reasons"][0]["reason"] == "No reason given" and [f["stage"] for f in r["funnel"]][0] == "New lead"


async def test_new_instagram_contacts_can_become_deals_automatically(wsa):
    await wsa.inbound("hello", from_="909833300001", name="Before")
    assert (await wsa.get("/pipeline/deals")).json()["total"] == 0  # off by default
    r = await wsa.patch("/settings", json={"settings": {"pipeline": {"auto_create": True, "default_value": 250000}}})
    assert r.status_code == 200 and r.json()["settings"]["pipeline"]["auto_create"] is True
    await wsa.inbound("hello", from_="909833300002", name="Nisha Verma")
    await wsa.inbound("again", from_="909833300002", name="Nisha Verma")  # existing contact: no second deal
    deals = (await wsa.get("/pipeline/deals")).json()
    assert deals["total"] == 1 and deals["items"][0]["title"] == "Nisha Verma" and deals["items"][0]["value"] == 250000 and deals["items"][0]["source"] == "instagram"
    assert (await wsa.patch("/settings", json={"settings": {"pipeline": {"default_value": "abc"}}})).status_code == 422


def _graph(*nodes, edges):
    return {"nodes": [{"id": i, "type": t, "position": {"x": 0, "y": 0}, "data": d} for i, t, d in nodes], "edges": [{"id": f"{s}-{t}", "source": s, "target": t} for s, t in edges]}


async def test_flow_nodes_create_and_move_deals_and_send_payment_links(wsa, meta, rzp):
    stages = {s["name"]: s["id"] for s in (await wsa.get("/pipeline/stages")).json()}
    await wsa.put("/payments/settings", json={"key_id": OWN_KEYS[0], "key_secret": OWN_KEYS[1]})
    g = _graph(("s", "start", {"trigger": "keyword", "keywords": ["buy"], "match": "contains"}),
               ("d", "create_deal", {"title": "{{first_name}} - order", "value": 1500, "stage_id": stages["Contacted"]}),
               ("p", "send_payment_link", {"amount": 1500, "description": "Order", "message": "Pay here: {{link}}"}),
               ("m", "move_deal", {"stage_id": stages["Proposal sent"]}),
               ("e", "end", {}), edges=[("s", "d"), ("d", "p"), ("p", "m"), ("m", "e")])
    f = (await wsa.post("/flows", json={"name": "Sell", "trigger_type": "keyword", "graph": g})).json()
    assert (await wsa.post(f"/flows/{f['id']}/publish")).status_code == 200
    await wsa.inbound("I want to buy", from_="909844400001", name="Kabir Singh")
    deals = (await wsa.get("/pipeline/deals")).json()["items"]
    assert len(deals) == 1 and deals[0]["title"] == "Kabir - order" and deals[0]["value"] == 150000 and deals[0]["stage_id"] == stages["Proposal sent"] and deals[0]["source"] == "flow"
    body = next(t for t in texts(meta) if "Pay here" in t)
    assert re.search(r"https://rzp\.io/i/plink_\d+", body)
    link = (await wsa.get("/payments/links")).json()[0]
    assert link["deal_id"] == deals[0]["id"] and link["amount"] == 150000

    bad = _graph(("s", "start", {"trigger": "keyword", "keywords": ["x"], "match": "contains"}), ("d", "create_deal", {"title": ""}), ("m", "move_deal", {}), ("p", "send_payment_link", {"amount": 0}),
                 edges=[("s", "d"), ("d", "m"), ("m", "p")])
    f2 = (await wsa.post("/flows", json={"name": "bad", "graph": bad})).json()
    r = await wsa.post(f"/flows/{f2['id']}/publish")
    assert r.status_code in (400, 422) and len(str(r.json())) > 20


# ---- public site forms ---------------------------------------------------------------------------------------------------------------------------

async def test_contact_form_stores_validates_and_resists_bots(app_client):
    ok = await app_client.post("/api/site/contact", json={"topic": "demo", "name": "Priya", "email": "Priya@Example.com", "message": "Please show me the inbox.", "company": "Acme"})
    assert ok.status_code == 201
    assert (await app_client.post("/api/site/contact", json={"name": "x", "email": "nope", "message": "hello there"})).status_code == 422
    assert (await app_client.post("/api/site/contact", json={"name": "x", "email": "a@b.co", "message": "hi"})).status_code == 422
    assert (await app_client.post("/api/site/contact", json={"name": "Bot", "email": "bot@x.co", "message": "buy pills now", "website": "http://spam"})).status_code == 201
    from app.models.public_forms import ContactMessage
    async with await db_session() as db:
        rows = (await db.execute(select(ContactMessage).where(ContactMessage.email.in_(["priya@example.com", "bot@x.co"])))).scalars().all()
    assert [r.email for r in rows] == ["priya@example.com"] and rows[0].topic == "demo"  # honeypot submissions aren't stored


async def test_newsletter_is_idempotent_and_rate_limited(app_client):
    for _ in range(2):
        assert (await app_client.post("/api/site/newsletter", json={"email": "Reader@Example.com", "source": "blog"})).status_code == 201
    from app.models.public_forms import NewsletterSubscriber
    async with await db_session() as db:
        assert len((await db.execute(select(NewsletterSubscriber).where(NewsletterSubscriber.email == "reader@example.com"))).scalars().all()) == 1
    assert (await app_client.post("/api/site/newsletter", json={"email": "bad"})).status_code == 422
    codes = [(await app_client.post("/api/site/contact", json={"name": "S", "email": "s@x.co", "message": "spam spam spam"})).status_code for _ in range(7)]
    assert codes[-1] == 429
