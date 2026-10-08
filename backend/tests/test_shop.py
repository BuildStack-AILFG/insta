"""Instagram Shop: storefront, import from posts, checkout (online via the workspace's Razorpay, or COD) and comment-to-checkout."""

from __future__ import annotations

import io
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from PIL import Image

from app.services import razorpay
from app.services import shop as shop_svc
from tests.conftest import texts
from tests.test_billing_pipeline import OWN_KEYS, FakeRazorpay

# The shop is a Growth-tier feature: run these on Growth. test_plans_admin covers the Starter/trial lock.
pytestmark = pytest.mark.paid

ADDRESS = {"line1": "12 MG Road", "city": "Pune", "state": "Maharashtra", "pincode": "411001"}


@pytest.fixture(scope="module")
def rzp():
    fake = FakeRazorpay()
    client = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
    razorpay._http_factory = lambda: client
    yield fake
    razorpay._http_factory = None


@pytest.fixture(scope="module", autouse=True)
def cdn():
    """Instagram's CDN: every image download returns a small JPEG."""
    buf = io.BytesIO()
    Image.new("RGB", (40, 50), (230, 80, 140)).save(buf, "JPEG")
    client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=buf.getvalue(), headers={"content-type": "image/jpeg"})))
    shop_svc._http_factory = lambda: client
    yield
    shop_svc._http_factory = None


async def _store(ws, **over) -> dict:
    body = {"slug": f"store-{ws.tenant_id[:8]}", "name": "Priya's Bakery", "tagline": "Fresh cakes, Pune", "cod_enabled": True,
            "account_id": ws.account["id"] if ws.account else None, "shipping_fee": 5000, "free_shipping_above": 100000}
    body.update(over)
    r = await ws.put("/shop", json=body)
    assert r.status_code == 200, r.text
    return r.json()


async def _product(ws, **over) -> dict:
    body = {"name": "Chocolate truffle cake", "price": 64900, "compare_at_price": 79900, "image_url": "https://cdn.test/cake.jpg", "stock": 3}
    body.update(over)
    r = await ws.post("/shop/products", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _checkout(product_id: str, **over) -> dict:
    return {"product_id": product_id, "qty": 1, "name": "Asha Rao", "phone": "98111 12222", "address": ADDRESS, "payment_method": "cod", **over}


# ---- pure helpers -----------------------------------------------------------------------------------------------------

def test_caption_parsing_finds_name_and_price():
    assert shop_svc.parse_caption("Chocolate truffle cake 🍫\nOnly ₹649! #cake #pune") == ("Chocolate truffle cake 🍫", "Chocolate truffle cake 🍫\nOnly ₹649!", 64900)
    assert shop_svc.parse_caption("Kurti set - Rs. 1,299\nDM to order")[0::2] == ("Kurti set", 129900)
    assert shop_svc.parse_caption("Silver jhumka 450/-")[2] == 45000
    assert shop_svc.parse_caption("Price: 899 only")[2] == 89900
    assert shop_svc.parse_caption("New drop! #ootd")[2] is None
    assert shop_svc.parse_caption(None) == ("Product", "", None)


def test_inr_uses_indian_grouping():
    assert [shop_svc.inr(v) for v in (64900, 12345678, 100, 99950)] == ["₹649", "₹1,23,456.78", "₹1", "₹999.50"]


def test_refs_are_signed():
    import uuid
    c, a = uuid.uuid4(), uuid.uuid4()
    ref = shop_svc.make_ref(c, a)
    assert shop_svc.read_ref(ref) == (c, a)
    assert shop_svc.read_ref(ref[:-1] + ("0" if ref[-1] != "0" else "1")) is None
    assert shop_svc.read_ref(f"{uuid.uuid4().hex}.{a.hex}.{ref.split('.')[2]}") is None  # someone else's contact id
    assert shop_svc.read_ref("garbage") is None and shop_svc.read_ref(None) is None


# ---- store & catalogue ------------------------------------------------------------------------------------------------

async def test_store_setup_validation_and_slug_clash(ws, other):
    assert (await ws.get("/shop")).json()["shop"] is None
    assert (await ws.post("/shop/products/import", json={"account_id": "00000000-0000-0000-0000-000000000000", "media_ids": ["1"]})).status_code == 422
    assert (await ws.put("/shop", json={"slug": "admin", "name": "X"})).status_code == 422
    assert (await ws.put("/shop", json={"slug": "ok-shop", "name": "X", "online_payments": False, "cod_enabled": False})).status_code == 422
    s = await _store(ws, slug=f"taken-{ws.tenant_id[:6]}")
    assert s["url"] == f"https://app.test/s/{s['slug']}"
    clash = await other.put("/shop", json={"slug": s["slug"], "name": "Other"})
    assert clash.status_code == 409
    again = await _store(ws, slug=s["slug"], name="Renamed")  # saving your own slug again is fine
    assert again["id"] == s["id"] and again["name"] == "Renamed"


async def test_import_posts_reads_caption_copies_photo_and_skips_duplicates(wsa, meta):
    meta.media["17900000000000101"] = {"id": "17900000000000101", "caption": "Red velvet jar cake\n₹249 each 🍰 #jarcake", "media_type": "IMAGE",
                                        "media_url": "https://scontent.cdninstagram.com/v/red.jpg", "permalink": "https://instagram.com/p/RV"}
    meta.media["17900000000000102"] = {"id": "17900000000000102", "caption": "Behind the scenes ✨", "media_type": "VIDEO",
                                        "thumbnail_url": "https://scontent.cdninstagram.com/v/bts.jpg", "permalink": "https://instagram.com/p/BTS"}
    body = {"account_id": wsa.account["id"], "media_ids": ["17900000000000101", "17900000000000102"]}
    r = (await wsa.post("/shop/products/import", json=body)).json()
    by_media = {p["media_id"]: p for p in r["created"]}
    cake, bts = by_media["17900000000000101"], by_media["17900000000000102"]
    assert cake["name"] == "Red velvet jar cake" and cake["price"] == 24900 and cake["status"] == "active"
    assert cake["image_url"].startswith("https://api.test/api/files/")  # our own copy, not the expiring CDN URL
    assert bts["price"] == 0 and bts["status"] == "hidden"  # no price in the caption: waits for one
    again = (await wsa.post("/shop/products/import", json=body)).json()
    assert again["created"] == [] and again["skipped"] == 2
    assert (await wsa.put(f"/shop/products/{bts['id']}", json={"name": "BTS", "price": 50})).status_code == 422  # below ₹1


# ---- checkout --------------------------------------------------------------------------------------------------------

async def test_cod_checkout_confirms_the_order_and_creates_a_contact(ws, app_client):
    s = await _store(ws)
    p = await _product(ws)
    hidden = await _product(ws, name="Secret", status="hidden")

    store = (await app_client.get(f"/api/public/store/{s['slug']}")).json()
    assert [x["name"] for x in store["products"]] == ["Chocolate truffle cake"]
    assert store["store"]["payment_methods"] == ["cod"]  # no Razorpay keys connected
    assert (await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(hidden["id"]))).status_code == 404
    online = await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"], payment_method="online"))
    assert online.status_code == 409

    r = await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"], qty=2))
    assert r.status_code == 201, r.text
    placed = r.json()
    assert placed["pay_url"] is None and placed["number"] == 1001

    order = (await ws.get("/shop/orders")).json()["items"][0]
    assert order["payment_status"] == "cod" and order["status"] == "confirmed" and order["source"] == "store"
    assert order["subtotal"] == 129800 and order["shipping"] == 0 and order["total"] == 129800  # free shipping above ₹1,000
    assert order["customer_phone"] == "919811112222"
    contact = (await ws.get(f"/contacts/{order['contact_id']}")).json()
    assert "customer" in contact["tags"]
    prod = (await ws.get("/shop/products")).json()
    cake = next(x for x in prod if x["id"] == p["id"])
    assert cake["stock"] == 1 and cake["orders_count"] == 1 and cake["revenue"] == 129800

    sold_out = await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"], qty=2))
    assert sold_out.status_code == 409 and "Only 1 of Chocolate truffle cake left" in sold_out.json()["detail"]["error"]

    page = await app_client.get(f"/api/public/store/{s['slug']}/orders/{placed['order_id']}", params={"t": "wrong-token-123"})
    assert page.status_code == 404
    page = (await app_client.get(f"/api/public/store/{s['slug']}/orders/{placed['order_id']}", params={"t": placed["token"]})).json()
    assert page["order"]["status"] == "confirmed" and "customer_phone" not in page["order"]

    shipped = await ws.patch(f"/shop/orders/{order['id']}", json={"status": "shipped", "mark_paid": True})
    assert shipped.json()["status"] == "shipped" and shipped.json()["payment_status"] == "paid"
    stats = (await ws.get("/shop")).json()["stats"]
    assert stats["orders"] == 1 and stats["revenue"] == 129800 and stats["comment_orders"] == 0


async def test_orders_are_private_to_their_workspace(ws, other, app_client):
    s = await _store(ws)
    p = await _product(ws, stock=None)
    await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"]))
    assert (await other.get("/shop/orders")).json()["total"] == 0
    order_id = (await ws.get("/shop/orders")).json()["items"][0]["id"]
    assert (await other.patch(f"/shop/orders/{order_id}", json={"status": "cancelled"})).status_code == 404
    assert (await other.put(f"/shop/products/{p['id']}", json={"name": "Mine", "price": 100})).status_code == 404


# ---- comment-to-checkout ------------------------------------------------------------------------------------------------

@pytest.mark.paid
async def test_comment_to_checkout_end_to_end(wsa, meta, app_client, rzp):
    assert (await wsa.put("/payments/settings", json={"key_id": OWN_KEYS[0], "key_secret": OWN_KEYS[1]})).status_code == 200
    s = await _store(wsa, confirmation_message="Thanks {{name}}! Order #{{order}} ({{total}}) is confirmed 🎂")
    p = await _product(wsa, stock=None)
    r = await wsa.post("/comment-automations", json={
        "account_id": wsa.account["id"], "name": "Cake price", "media_scope": "all", "match_type": "contains", "keywords": ["price"],
        "public_replies": ["Sent you the details {{username}}!"], "dm_text": "Hi {{username}}! Our truffle cake is ₹649 🍫", "product_id": p["id"],
        "buy_button": "Buy now"})
    assert r.status_code == 201, r.text
    automation = r.json()
    assert automation["product_id"] == p["id"]

    # 1. comment -> private reply with a postback "Buy now" (a link button would not open the messaging window)
    await wsa.comment("price?", from_="910000000501", username="asha.rao")
    dm = meta.sent[-1]
    assert dm["recipient"]["comment_id"]
    buy = dm["message"]["attachment"]["payload"]["buttons"][0]
    assert buy == {"type": "postback", "title": "Buy now", "payload": f"BUY:{automation['id']}"}

    # 2. tap -> product photo + personal checkout link
    meta.sent.clear()
    await wsa.postback(buy["payload"], "Buy now", from_="910000000501")
    sent = texts(meta)
    assert sent[0] == "[attachment] https://cdn.test/cake.jpg" and sent[1].startswith("[buttons] Chocolate truffle cake\n₹649 (MRP ₹799)")
    checkout_url = meta.sent[1]["message"]["attachment"]["payload"]["buttons"][0]["url"]
    assert checkout_url.startswith(f"https://app.test/s/{s['slug']}/p/{p['id']}?r=")
    ref = parse_qs(urlsplit(checkout_url).query)["r"][0]

    # 3. checkout online -> a payment link on the workspace's own Razorpay account
    r = await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"], payment_method="online", ref=ref, email="asha@example.com"))
    assert r.status_code == 201, r.text
    placed = r.json()
    assert placed["pay_url"].startswith("https://rzp.io/")
    plink = next(v for v in rzp.links.values() if v["short_url"] == placed["pay_url"])
    assert plink["amount"] == 69900 and plink["body"]["customer"]["contact"] == "+919811112222"  # ₹649 + ₹50 shipping
    assert plink["body"]["callback_url"] == placed["order_url"]
    order = (await wsa.get("/shop/orders")).json()["items"][0]
    assert order["payment_status"] == "pending" and order["source"] == "comment" and order["automation"]["name"] == "Cake price"

    # 4. back from Razorpay: the order page asks Razorpay, sees it paid, confirms and DMs the buyer
    meta.sent.clear()
    plink["status"] = "paid"
    page = (await app_client.get(f"/api/public/store/{s['slug']}/orders/{placed['order_id']}", params={"t": placed["token"]})).json()
    assert page["order"]["payment_status"] == "paid" and page["order"]["status"] == "confirmed" and page["order"]["pay_url"] is None
    assert texts(meta) == [f"[buttons] Thanks Asha! Order #{placed['number']} (₹699) is confirmed 🎂"]
    order = (await wsa.get("/shop/orders")).json()["items"][0]
    assert order["confirmation_sent"] is True

    stats = (await wsa.get(f"/comment-automations/{automation['id']}")).json()["stats"]
    assert stats["orders"] == 1 and stats["revenue"] == 69900
    shop_stats = (await wsa.get("/shop")).json()["stats"]
    assert shop_stats["comment_orders"] == 1 and shop_stats["comment_revenue"] == 69900
    contact = (await wsa.get(f"/contacts/{order['contact_id']}")).json()
    assert contact["username"] == "asha.rao" and contact["phone"] == "919811112222" and "customer" in contact["tags"]

    # the poller seeing the same payment again changes nothing
    meta.sent.clear()
    page = (await app_client.get(f"/api/public/store/{s['slug']}/orders/{placed['order_id']}", params={"t": placed["token"]})).json()
    assert meta.sent == [] and (await wsa.get(f"/comment-automations/{automation['id']}")).json()["stats"]["orders"] == 1


async def test_forged_ref_is_ignored_and_buy_taps_for_missing_products_apologise(wsa, meta, app_client):
    s = await _store(wsa)
    p = await _product(wsa, stock=None)
    forged = f"{'a' * 32}.{'b' * 32}.0123456789abcdef0123"
    r = await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"], ref=forged, phone="+91 90000 11111"))
    order = (await wsa.get("/shop/orders")).json()["items"][0]
    assert r.status_code == 201 and order["source"] == "store" and order["automation"] is None

    a = (await wsa.post("/comment-automations", json={
        "account_id": wsa.account["id"], "name": "Gone", "media_scope": "all", "match_type": "any", "public_reply_enabled": False,
        "dm_text": "Here you go", "product_id": p["id"]})).json()
    await wsa.put(f"/shop/products/{p['id']}", json={"name": p["name"], "price": p["price"], "status": "hidden"})
    meta.sent.clear()
    await wsa.postback(f"BUY:{a['id']}", "Buy now", from_="910000000777")
    assert texts(meta) == ["Sorry, this one isn't available right now 🙏 We'll let you know when it's back!"]

    too_many = await wsa.post("/comment-automations", json={
        "account_id": wsa.account["id"], "name": "Full", "media_scope": "all", "match_type": "any", "public_reply_enabled": False, "dm_text": "Hi",
        "product_id": p["id"], "dm_buttons": [{"title": f"L{i}", "url": "https://x.example.com"} for i in range(3)]})
    assert too_many.status_code == 422


# ---- phase 2: ordering in chat, COD confirmation, reminders ---------------------------------------------------------------

def test_delivery_details_are_read_from_one_message():
    d = shop_svc.parse_details("Priya Sharma\n98765 43210\nFlat 4B, Green Park, MG Road, Pune 411001", "91")
    assert d == {"name": "Priya Sharma", "phone": "919876543210",
                 "address": {"line1": "Flat 4B, Green Park, MG Road, Pune", "line2": "", "city": "", "state": "", "pincode": "411001"}}
    one_line = shop_svc.parse_details("12 Lake View Road Kolkata 700029 +91-9830012345", "91")
    assert one_line["name"] is None and one_line["phone"] == "919830012345" and one_line["address"]["pincode"] == "700029"
    assert shop_svc.parse_details("919876543210, 5 Park St, Delhi 110001", "91")["phone"] == "919876543210"
    assert shop_svc.parse_details("Priya, Pune 411001", "91") is None          # no mobile number
    assert shop_svc.parse_details("Priya 9876543210 Pune", "91") is None       # no pincode
    assert shop_svc.parse_details("9876543210 411001", "91") is None           # no address


async def _selling(wsa, **shop_over) -> tuple[dict, dict, dict]:
    s = await _store(wsa, **shop_over)
    p = await _product(wsa, stock=5)
    a = (await wsa.post("/comment-automations", json={
        "account_id": wsa.account["id"], "name": "Cake", "media_scope": "all", "match_type": "any", "public_reply_enabled": False,
        "dm_text": "Here you go {{username}}", "product_id": p["id"], "once_per_user": False})).json()
    return s, p, a


def _buttons(meta, i=-1) -> list[dict]:
    return meta.sent[i]["message"]["attachment"]["payload"]["buttons"]


async def _tap_buy(wsa, meta, a, igsid) -> list[dict]:
    await wsa.comment("want", from_=igsid, username="buyer.one")
    meta.sent.clear()
    await wsa.postback(f"BUY:{a['id']}", "Buy now", from_=igsid)
    return _buttons(meta)


def _quick_replies(meta) -> list[dict]:
    return next(m["message"]["quick_replies"] for m in reversed(meta.sent) if m.get("message", {}).get("quick_replies"))


async def _pick(wsa, meta, igsid: str, title: str) -> None:
    """Tap one of the quick replies under our last question."""
    option = next(q for q in _quick_replies(meta) if q["title"] == title)
    await wsa.inbound(from_=igsid, extra={"text": title, "quick_reply": {"payload": option["payload"]}})


async def test_order_in_chat_with_cod_then_again_with_the_saved_address(wsa, meta):
    s, p, a = await _selling(wsa)
    igsid = "910000000601"
    card = await _tap_buy(wsa, meta, a, igsid)
    assert [b["title"] for b in card] == ["Checkout", "💬 Order in chat"]

    meta.sent.clear()
    await wsa.postback(card[1]["payload"], "Order in chat", from_=igsid)
    assert texts(meta)[0] == "How many would you like?" and [q["title"] for q in _quick_replies(meta)] == ["1", "2", "3", "4", "5"]
    await _pick(wsa, meta, igsid, "1")
    assert texts(meta)[-1].startswith("Please send your delivery details")

    meta.sent.clear()
    await wsa.inbound("is it eggless?", from_=igsid)  # no numbers: a question, left to the normal replies
    assert not any("couldn't quite read" in t for t in texts(meta))
    await wsa.inbound("my number is 12345", from_=igsid)
    assert "couldn't quite read" in texts(meta)[-1]

    meta.sent.clear()
    await wsa.inbound("Asha Rao\n98111 12222\n7 Lake Road, Koregaon Park, Pune 411001", from_=igsid)
    summary = texts(meta)[-1]
    assert "Total: ₹699" in summary and "Asha Rao, 7 Lake Road, Koregaon Park, Pune, 411001" in summary and "+919811112222" in summary
    choices = _buttons(meta)
    assert [b["title"] for b in choices] == ["💵 Cash on delivery", "✏️ Change address"]  # no Razorpay keys: COD only

    meta.sent.clear()
    await wsa.postback(choices[0]["payload"], "Cash on delivery", from_=igsid)
    assert texts(meta)[-1].startswith("[buttons] Thank you Asha! 🎉 Your order #")
    order = (await wsa.get("/shop/orders")).json()["items"][0]
    assert order["source"] == "chat" and order["status"] == "confirmed" and order["payment_status"] == "cod" and order["cod_confirmation"] is None
    assert order["automation"]["name"] == "Cake" and order["address"]["pincode"] == "411001"
    await wsa.postback(choices[0]["payload"], "Cash on delivery", from_=igsid)  # double tap: no second order
    assert (await wsa.get("/shop/orders")).json()["total"] == 1
    assert "already placed" in texts(meta)[-1]

    # next time: one tap to reuse the address
    card = await _tap_buy(wsa, meta, a, igsid)
    meta.sent.clear()
    await wsa.postback(card[1]["payload"], "Order in chat", from_=igsid)
    await _pick(wsa, meta, igsid, "2")
    assert "same address as last time" in texts(meta)[-1] and "7 Lake Road" in texts(meta)[-1]
    same = _buttons(meta)[0]
    meta.sent.clear()
    await wsa.postback(same["payload"], "Yes", from_=igsid)
    assert "× 2 — ₹1,298" in texts(meta)[-1] and "Total: ₹1,298" in texts(meta)[-1]  # free delivery above ₹1,000
    await wsa.postback(_buttons(meta)[0]["payload"], "Cash on delivery", from_=igsid)
    assert (await wsa.get("/shop/orders")).json()["total"] == 2
    stock = next(x for x in (await wsa.get("/shop/products")).json() if x["id"] == p["id"])["stock"]
    assert stock == 2


@pytest.mark.paid
async def test_order_in_chat_paid_online(wsa, meta, rzp, app_client):
    await wsa.put("/payments/settings", json={"key_id": OWN_KEYS[0], "key_secret": OWN_KEYS[1]})
    s, p, a = await _selling(wsa, cod_enabled=False)
    igsid = "910000000611"
    card = await _tap_buy(wsa, meta, a, igsid)
    await wsa.postback(card[1]["payload"], "Order in chat", from_=igsid)
    await _pick(wsa, meta, igsid, "1")
    meta.sent.clear()
    await wsa.inbound("Ravi Kumar\n+91 99000 11122\n22 Brigade Road, Bengaluru 560001", from_=igsid)
    pay = _buttons(meta)[0]
    assert pay["title"] == "💳 Pay online"
    meta.sent.clear()
    await wsa.postback(pay["payload"], "Pay online", from_=igsid)
    link = _buttons(meta)[0]
    assert link["type"] == "web_url" and link["url"].startswith("https://rzp.io/") and "reserved for you" in texts(meta)[0]
    order = (await wsa.get("/shop/orders")).json()["items"][0]
    assert order["payment_status"] == "pending" and order["source"] == "chat"
    next(v for v in rzp.links.values() if v["short_url"] == link["url"])["status"] = "paid"
    from sqlalchemy import select
    from app.models.billing import PaymentLink
    from app.services import payment_links
    from tests.conftest import db_session
    async with await db_session() as db:  # what the webhook / poller does
        pl = (await db.execute(select(PaymentLink).where(PaymentLink.short_url == link["url"]))).scalar_one()
        await payment_links.refresh(db, pl)
    paid = (await wsa.get("/shop/orders")).json()["items"][0]
    assert paid["payment_status"] == "paid" and paid["status"] == "confirmed"


async def test_store_cod_order_from_an_instagram_buyer_is_confirmed_over_dm(wsa, meta, app_client):
    s, p, a = await _selling(wsa)
    igsid = "910000000621"
    card = await _tap_buy(wsa, meta, a, igsid)
    ref = parse_qs(urlsplit(card[0]["url"]).query)["r"][0]

    meta.sent.clear()
    r = await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"], ref=ref, qty=2))
    assert r.status_code == 201
    ask = texts(meta)[-1]
    assert "Please confirm your cash-on-delivery order" in ask and "Pay ₹1,298 on delivery" in ask
    order = (await wsa.get("/shop/orders")).json()["items"][0]
    assert order["status"] == "new" and order["cod_confirmation"] == "asked"
    assert next(x for x in (await wsa.get("/shop/products")).json() if x["id"] == p["id"])["stock"] == 3  # reserved meanwhile

    no = _buttons(meta)[1]
    meta.sent.clear()
    await wsa.postback(no["payload"], "Cancel order", from_=igsid)
    assert "is cancelled" in texts(meta)[0]
    order = (await wsa.get("/shop/orders")).json()["items"][0]
    assert order["status"] == "cancelled" and order["cod_confirmation"] == "declined"
    prod = next(x for x in (await wsa.get("/shop/products")).json() if x["id"] == p["id"])
    assert prod["stock"] == 5 and prod["orders_count"] == 0  # stock and counters given back
    assert (await wsa.get(f"/comment-automations/{a['id']}")).json()["stats"]["orders"] == 0

    await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"], ref=ref))
    meta.sent.clear()
    yes = (await wsa.get("/shop/orders")).json()["items"][0]
    await wsa.postback(f"COD:yes:{yes['id']}", "Confirm order", from_=igsid)
    assert texts(meta)[0].startswith("[buttons] Thank you Asha!")
    assert (await wsa.get("/shop/orders")).json()["items"][0]["status"] == "confirmed"
    await wsa.postback(f"COD:yes:{yes['id']}", "Confirm order", from_="910000000999")  # someone else's tap is ignored
    assert (await wsa.get("/shop/orders")).json()["items"][0]["cod_confirmation"] == "confirmed"


async def test_seller_cancelling_a_cod_order_releases_stock(ws, app_client):
    s = await _store(ws)
    p = await _product(ws, stock=2)
    await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"], qty=2))
    order = (await ws.get("/shop/orders")).json()["items"][0]
    assert order["status"] == "confirmed"  # store buyer without Instagram: nothing to ask over DM
    assert (await ws.patch(f"/shop/orders/{order['id']}", json={"status": "cancelled"})).json()["status"] == "cancelled"
    assert next(x for x in (await ws.get("/shop/products")).json() if x["id"] == p["id"])["stock"] == 2
    assert (await ws.patch(f"/shop/orders/{order['id']}", json={"status": "shipped"})).status_code == 409


async def _age(model, row_id, field: str, minutes: int) -> None:
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import update
    from tests.conftest import db_session
    async with await db_session() as db:
        await db.execute(update(model).where(model.id == row_id).values({field: datetime.now(timezone.utc) - timedelta(minutes=minutes)}))
        await db.commit()


@pytest.mark.paid
async def test_reminders_recover_abandoned_carts_and_unpaid_orders(wsa, meta, rzp, app_client):
    import uuid as _uuid
    from sqlalchemy import select
    from app.models.shop import ShopCart, ShopOrder
    from tests.conftest import db_session
    await wsa.put("/payments/settings", json={"key_id": OWN_KEYS[0], "key_secret": OWN_KEYS[1]})
    s, p, a = await _selling(wsa, reminder_after_minutes=30, reminder_message="{{name}}, your {{product}} is waiting 🍫")
    igsid = "910000000631"
    card = await _tap_buy(wsa, meta, a, igsid)
    async with await db_session() as db:
        cart = (await db.execute(select(ShopCart).where(ShopCart.product_id == _uuid.UUID(p["id"])))).scalar_one()

    meta.sent.clear()
    assert await shop_svc.send_reminders() == 0  # too soon
    await _age(ShopCart, cart.id, "updated_at", 45)
    assert await shop_svc.send_reminders() == 1
    assert texts(meta)[0] == "[buttons] buyer.one, your Chocolate truffle cake is waiting 🍫"
    assert await shop_svc.send_reminders() == 0  # only ever one nudge

    # they come back and order online, but don't pay yet
    ref = parse_qs(urlsplit(card[0]["url"]).query)["r"][0]
    placed = (await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"], ref=ref, payment_method="online"))).json()
    order = (await wsa.get("/shop/orders")).json()["items"][0]
    assert order["recovered"] is True  # ordered after the cart reminder

    meta.sent.clear()
    await _age(ShopOrder, _uuid.UUID(placed["order_id"]), "created_at", 45)
    assert await shop_svc.send_reminders() == 1
    assert "is waiting for payment" in texts(meta)[0] and _buttons(meta)[0]["url"] == placed["pay_url"]

    next(v for v in rzp.links.values() if v["short_url"] == placed["pay_url"])["status"] = "paid"
    await app_client.get(f"/api/public/store/{s['slug']}/orders/{placed['order_id']}", params={"t": placed["token"]})
    stats = (await wsa.get("/shop")).json()["stats"]
    assert stats["recovered_orders"] == 1 and stats["recovered_revenue"] == 69900


async def test_reminders_respect_the_switch_and_the_messaging_window(wsa, meta):
    import uuid as _uuid
    from sqlalchemy import select
    from app.models.shop import ShopCart
    from tests.conftest import db_session
    s, p, a = await _selling(wsa, reminders_enabled=False)
    await _tap_buy(wsa, meta, a, "910000000641")
    async with await db_session() as db:
        cart = (await db.execute(select(ShopCart).where(ShopCart.product_id == _uuid.UUID(p["id"])))).scalar_one()
    await _age(ShopCart, cart.id, "updated_at", 90)
    assert await shop_svc.send_reminders() == 0
    await _store(wsa, reminders_enabled=True)
    await _age(ShopCart, cart.id, "updated_at", 60 * 24)  # Instagram's 24h window has closed
    assert await shop_svc.send_reminders() == 0


# ---- phase 3: shipping & tracking, Shiprocket, GST invoices, reports ----------------------------------------------------------

class FakeShiprocket:
    """Stands in for apiv2.shiprocket.in: login, pickup addresses, order creation and AWB assignment."""

    def __init__(self):
        self.calls: list[dict] = []
        self.awb_fails = 0
        self.logins = 0
        self._n = 0

    def handler(self, request: httpx.Request) -> httpx.Response:
        import json
        body = json.loads(request.content) if request.content else {}
        path = request.url.path.removeprefix("/v1/external")
        self.calls.append({"method": request.method, "path": path, "body": body})
        if path == "/auth/login":
            if body.get("password") != "api-pass":
                return httpx.Response(400, json={"message": "Invalid email and password combination"})
            self.logins += 1
            return httpx.Response(200, json={"token": f"tok{self.logins}"})
        if not request.headers.get("authorization", "").startswith("Bearer tok"):
            return httpx.Response(401, json={"message": "Unauthenticated."})
        if path == "/settings/company/pickup":
            return httpx.Response(200, json={"data": {"shipping_address": [{"pickup_location": "Home"}, {"pickup_location": "Studio"}]}})
        if path == "/orders/create/adhoc":
            self._n += 1
            return httpx.Response(200, json={"order_id": 5000 + self._n, "shipment_id": 9000 + self._n, "status": "NEW"})
        if path == "/courier/assign/awb":
            if self.awb_fails:
                self.awb_fails -= 1
                return httpx.Response(200, json={"awb_assign_status": 0, "message": "Insufficient wallet balance"})
            return httpx.Response(200, json={"awb_assign_status": 1, "response": {"data": {"awb_code": f"AWB{body['shipment_id']}", "courier_name": "Delhivery Surface"}}})
        return httpx.Response(404, json={"message": f"unhandled {path}"})


@pytest.fixture(scope="module")
def srk():
    from app.services import shiprocket
    fake = FakeShiprocket()
    client = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
    shiprocket._http_factory = lambda: client
    yield fake
    shiprocket._http_factory = None


async def _chat_cod_order(wsa, meta, igsid: str, details: str = "Asha Rao\n98111 12222\n7 Lake Road, Koregaon Park, Pune 411001") -> dict:
    """An Instagram buyer orders COD in chat (so their messaging window is open). Returns the order as the dashboard shows it."""
    s, p, a = await _selling(wsa)
    card = await _tap_buy(wsa, meta, a, igsid)
    await wsa.postback(card[1]["payload"], "Order in chat", from_=igsid)
    await _pick(wsa, meta, igsid, "1")
    meta.sent.clear()
    await wsa.inbound(details, from_=igsid)
    await wsa.postback(_buttons(meta)[0]["payload"], "Cash on delivery", from_=igsid)
    return (await wsa.get("/shop/orders")).json()["items"][0]


async def test_manual_shipping_dms_the_buyer_and_shows_tracking(wsa, meta, app_client):
    order = await _chat_cod_order(wsa, meta, "910000000701")
    assert order["invoice_number"].startswith("INV/2026-27/") and order["invoice_url"].startswith("/s/")
    meta.sent.clear()
    r = await wsa.post(f"/shop/orders/{order['id']}/ship", json={"courier": "DTDC", "awb": "D123456", "tracking_url": "https://dtdc.example.com/t/D123456"})
    assert r.status_code == 200 and r.json()["status"] == "shipped"
    assert texts(meta)[0].startswith("[buttons] 📦 Your order #") and "DTDC · AWB D123456" in texts(meta)[0]
    assert _buttons(meta)[0]["url"] == "https://dtdc.example.com/t/D123456"

    slug, token = order["order_url"].split("/")[2], order["order_url"].split("t=")[1]
    page = (await app_client.get(f"/api/public/store/{slug}/orders/{order['id']}", params={"t": token})).json()["order"]
    assert page["status"] == "shipped" and page["awb"] == "D123456" and page["tracking_url"].endswith("D123456")

    meta.sent.clear()
    done = (await wsa.patch(f"/shop/orders/{order['id']}", json={"status": "delivered"})).json()
    assert done["status"] == "delivered" and done["payment_status"] == "paid"  # COD collected on delivery
    assert "has been delivered" in texts(meta)[0]


async def test_buyers_can_ask_where_their_order_is(wsa, meta):
    order = await _chat_cod_order(wsa, meta, "910000000711")
    await wsa.post(f"/shop/orders/{order['id']}/ship", json={"courier": "Blue Dart", "awb": "BD777"})
    meta.sent.clear()
    await wsa.inbound("hi, where is my order?", from_="910000000711")
    reply = texts(meta)[0]
    assert reply.startswith("[buttons] Here's where your order is") and f"#{order['number']}" in reply and "Blue Dart AWB BD777" in reply

    meta.sent.clear()
    await wsa.inbound("track my parcel pls", from_="910000000799")  # no orders: left to the normal replies
    assert not any("where your order is" in t for t in texts(meta))


@pytest.mark.paid
async def test_shiprocket_connect_ship_and_tracking_webhook(wsa, meta, app_client, srk):
    bad = await wsa.put("/shop/shiprocket", json={"email": "api@shop.example.com", "password": "nope"})
    assert bad.status_code == 422 and "API user" in bad.json()["detail"]["error"]
    conn = (await wsa.put("/shop/shiprocket", json={"email": "api@shop.example.com", "password": "api-pass", "pickup_location": "Studio"})).json()
    assert conn["connected"] and conn["pickup_location"] == "Studio" and conn["pickup_locations"] == ["Home", "Studio"]
    hook = conn["webhook_url"].replace("https://api.test", "")
    assert hook.startswith("/api/courier-updates/") and not any(w in hook.split("/")[-1] for w in ("sr", "kr"))
    assert not any(i["provider"] == "shiprocket" for i in (await wsa.get("/integrations")).json())
    again = (await wsa.get("/shop/shiprocket")).json()
    assert again["webhook_key"] == conn["webhook_key"] and "password" not in str(again)

    order = await _chat_cod_order(wsa, meta, "910000000721")  # chat address: no city / state yet
    missing = await wsa.post(f"/shop/orders/{order['id']}/shiprocket", json={})
    assert missing.status_code == 422 and "city, state" in missing.json()["detail"]["error"]

    srk.awb_fails = 1
    first = (await wsa.post(f"/shop/orders/{order['id']}/shiprocket", json={"city": "Pune", "state": "Maharashtra"})).json()
    assert first["shipped"] is False and first["order"]["shiprocket_shipment_id"] and "no courier" in first["message"]
    created = [c for c in srk.calls if c["path"] == "/orders/create/adhoc"][-1]["body"]
    assert created["order_id"] == f"GFG-{order['number']}" and created["payment_method"] == "COD" and created["billing_phone"] == "9811112222"
    assert created["billing_city"] == "Pune" and created["pickup_location"] == "Studio" and created["weight"] == 0.5
    meta.sent.clear()
    second = (await wsa.post(f"/shop/orders/{order['id']}/shiprocket", json={})).json()
    assert second["shipped"] is True and len([c for c in srk.calls if c["path"] == "/orders/create/adhoc"]) == 1  # reused the shipment
    shipped = second["order"]
    assert shipped["courier"] == "Delhivery Surface" and shipped["tracking_url"] == f"https://shiprocket.co/tracking/{shipped['awb']}"
    assert "Delhivery Surface" in texts(meta)[0]

    import json
    def post(payload, key):
        return app_client.post(hook, content=json.dumps(payload), headers={"content-type": "application/json", "x-api-key": key})
    assert (await post({"awb": shipped["awb"], "current_status": "DELIVERED"}, "wrong")).status_code == 401
    meta.sent.clear()
    r = await post({"awb": shipped["awb"], "current_status": "OUT FOR DELIVERY"}, conn["webhook_key"])
    assert r.json()["result"] == "out_for_delivery" and "out for delivery" in texts(meta)[0]
    await post({"awb": shipped["awb"], "current_status": "OUT FOR DELIVERY"}, conn["webhook_key"])  # repeats don't re-DM
    assert len(meta.sent) == 1
    assert (await post({"awb": shipped["awb"], "current_status": "DELIVERED"}, conn["webhook_key"])).json()["result"] == "delivered"
    assert (await post({"awb": "NOPE", "current_status": "DELIVERED"}, conn["webhook_key"])).json()["result"] == "unknown_order"
    final = next(o for o in (await wsa.get("/shop/orders")).json()["items"] if o["id"] == order["id"])
    assert final["status"] == "delivered" and final["courier_status"] == "DELIVERED"

    rto = await _chat_cod_order(wsa, meta, "910000000722", "Ravi\n9900011122\n1 MG Road, Pune 411001")
    await post({"order_id": f"GFG-{rto['number']}", "awb": "RTO1", "current_status": "RTO INITIATED"}, conn["webhook_key"])
    assert next(o for o in (await wsa.get("/shop/orders")).json()["items"] if o["id"] == rto["id"])["status"] == "returned"


async def test_gst_invoice_splits_tax_by_place_of_supply(ws, app_client):
    s = await _store(ws, gstin="27abcde1234f1z5", legal_name="Priya Foods LLP", business_address="12 FC Road, Pune", gst_rate=18)
    assert s["gstin"] == "27ABCDE1234F1Z5"
    assert (await ws.put("/shop", json={"slug": s["slug"], "name": "x", "cod_enabled": True, "gstin": "BAD"})).status_code == 422
    p = await _product(ws, stock=None, price=118000, compare_at_price=None)
    local = (await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(p["id"]))).json()
    inv = (await app_client.get(f"/api/public/store/{s['slug']}/orders/{local['order_id']}/invoice", params={"t": local["token"]})).json()
    assert inv["kind"] == "tax_invoice" and inv["intra_state"] and inv["place_of_supply"] == "Maharashtra" and inv["seller"]["name"] == "Priya Foods LLP"
    assert inv["totals"] == {"taxable": 100000, "cgst": 9000, "sgst": 9000, "igst": 0, "total": 118000}  # free delivery above ₹1,000
    first_no = inv["number"]
    assert first_no.startswith("INV/2026-27/")

    other = (await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(
        p["id"], address={"line1": "5 Brigade Rd", "city": "Bengaluru", "state": "Karnataka", "pincode": "560001"}))).json()
    inv2 = (await app_client.get(f"/api/public/store/{s['slug']}/orders/{other['order_id']}/invoice", params={"t": other["token"]})).json()
    assert not inv2["intra_state"] and inv2["totals"]["igst"] == 18000 and inv2["totals"]["cgst"] == 0
    assert int(inv2["number"].rsplit("/", 1)[1]) == int(first_no.rsplit("/", 1)[1]) + 1
    assert (await app_client.get(f"/api/public/store/{s['slug']}/orders/{other['order_id']}/invoice", params={"t": "wrong-token-1"})).status_code == 404

    await _store(ws, gstin="")
    plain = (await app_client.get(f"/api/public/store/{s['slug']}/orders/{local['order_id']}/invoice", params={"t": local["token"]})).json()
    assert plain["kind"] == "bill_of_supply" and plain["totals"]["cgst"] == 0 and plain["totals"]["taxable"] == 118000


@pytest.mark.paid
async def test_reports_show_sales_per_post_and_the_funnel(wsa, meta, rzp):
    await _chat_cod_order(wsa, meta, "910000000731")
    rep = (await wsa.get("/shop/reports", params={"days": 30})).json()
    row = rep["by_automation"][0]
    assert row["name"] == "Cake" and row["comments"] == 1 and row["buy_taps"] == 1 and row["orders"] == 1 and row["revenue"] == 69900 and row["conversion"] == 100.0
    assert rep["by_source"]["chat"] == {"orders": 1, "revenue": 69900}
    assert rep["series"][-1]["revenue"] == 69900 and rep["funnel"]["buy_taps"] == 1
    assert rep["by_product"][0]["name"] == "Chocolate truffle cake"


# ---- phase 4: variants & multi-item cart -----------------------------------------------------------------------------------------

SIZES = {"name": "Size", "values": ["S", "M", "L"]}
COLOURS = {"name": "Colour", "values": ["Red", "Black"]}


async def _kurti(ws, **over) -> dict:
    """A kurti in S/M/L × Red/Black: L costs more, M/Black is sold out."""
    variants = [{"options": {"Size": s, "Colour": c}, "price": 149900 if s == "L" else None, "stock": 0 if (s, c) == ("M", "Black") else 4}
                for s in SIZES["values"] for c in COLOURS["values"]]
    body = {"name": "Cotton kurti", "price": 129900, "image_url": "https://cdn.test/kurti.jpg", "options": [SIZES, COLOURS], "variants": variants, **over}
    r = await ws.post("/shop/products", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def _variant(p: dict, title: str) -> dict:
    return next(v for v in p["variants"] if v["title"] == title)


async def test_variants_are_validated_and_survive_edits(ws, app_client):
    s = await _store(ws)
    bad = [
        {"options": [SIZES], "variants": []},                                                                   # options but no variants
        {"options": [SIZES], "variants": [{"options": {"Size": "XL"}}]},                                         # value not in the list
        {"options": [SIZES, COLOURS], "variants": [{"options": {"Size": "S"}}]},                                 # missing an option
        {"options": [SIZES], "variants": [{"options": {"Size": "S"}}, {"options": {"Size": "S"}}]},              # duplicate
        {"options": [SIZES, {"name": "size", "values": ["x"]}], "variants": []},                                 # same option twice
    ]
    for extra in bad:
        assert (await ws.post("/shop/products", json={"name": "X", "price": 10000, **extra})).status_code == 422, extra

    p = await _kurti(ws)
    assert len(p["variants"]) == 6 and p["stock"] is None and _variant(p, "L / Red")["price"] == 149900
    pub = (await app_client.get(f"/api/public/store/{s['slug']}/products/{p['id']}")).json()["product"]
    assert pub["price"] == 129900 and pub["price_varies"] is True and pub["sold_out"] is False
    assert _variant(pub, "M / Black")["sold_out"] is True and _variant(pub, "L / Black")["price"] == 149900
    listing = (await app_client.get(f"/api/public/store/{s['slug']}")).json()["products"]
    assert next(x for x in listing if x["id"] == p["id"])["price_varies"] is True

    # drop size S and change one stock: other variants keep their ids
    keep = [{"options": v["options"], "price": v["price"], "stock": 9 if v["title"] == "M / Red" else v["stock"]} for v in p["variants"] if v["options"]["Size"] != "S"]
    r = await ws.put(f"/shop/products/{p['id']}", json={"name": "Cotton kurti", "price": 129900, "options": [{"name": "Size", "values": ["M", "L"]}, COLOURS], "variants": keep})
    edited = r.json()
    assert r.status_code == 200 and len(edited["variants"]) == 4
    assert _variant(edited, "M / Red")["id"] == _variant(p, "M / Red")["id"] and _variant(edited, "M / Red")["stock"] == 9

    # every variant switched off: the product behaves like a plain one again
    off = [{**v, "enabled": False} for v in keep]
    plain = (await ws.put(f"/shop/products/{p['id']}", json={"name": "Cotton kurti", "price": 129900, "options": [{"name": "Size", "values": ["M", "L"]}, COLOURS], "variants": off})).json()
    pub = (await app_client.get(f"/api/public/store/{s['slug']}/products/{plain['id']}")).json()["product"]
    assert pub["variants"] == [] and pub["options"] == []


async def test_cart_checkout_with_several_items_and_variants(ws, app_client):
    s = await _store(ws, gstin="27ABCDE1234F1Z5", gst_rate=5)
    k = await _kurti(ws)
    cake = await _product(ws, stock=3)
    url = f"/api/public/store/{s['slug']}/checkout"
    base = {k_: v for k_, v in _checkout(cake["id"]).items() if k_ not in ("product_id", "qty")}

    no_size = await app_client.post(url, json={**base, "items": [{"product_id": k["id"], "qty": 1}]})
    assert no_size.status_code == 422 and "Choose size and colour for Cotton kurti" in no_size.json()["detail"]["error"]
    sold = await app_client.post(url, json={**base, "items": [{"product_id": k["id"], "variant_id": _variant(k, "M / Black")["id"]}]})
    assert sold.status_code == 409 and "Cotton kurti (M / Black) is sold out" in sold.json()["detail"]["error"]
    other_product_variant = await app_client.post(url, json={**base, "items": [{"product_id": cake["id"], "variant_id": _variant(k, "S / Red")["id"]}]})
    assert other_product_variant.status_code == 201  # a stray variant on a product without options is ignored
    await ws.patch(f"/shop/orders/{(await ws.get('/shop/orders')).json()['items'][0]['id']}", json={"status": "cancelled"})

    lines = [{"product_id": k["id"], "variant_id": _variant(k, "L / Red")["id"], "qty": 2}, {"product_id": k["id"], "variant_id": _variant(k, "S / Black")["id"]},
             {"product_id": cake["id"], "qty": 1}, {"product_id": k["id"], "variant_id": _variant(k, "L / Red")["id"], "qty": 1}]  # repeated line is merged
    placed = (await app_client.post(url, json={**base, "items": lines})).json()
    order = (await ws.get("/shop/orders")).json()["items"][0]
    assert [(i["name"], i["variant"], i["qty"], i["price"]) for i in order["items"]] == [
        ("Cotton kurti", "L / Red", 3, 149900), ("Cotton kurti", "S / Black", 1, 129900), ("Chocolate truffle cake", None, 1, 64900)]
    assert order["subtotal"] == 3 * 149900 + 129900 + 64900 and order["shipping"] == 0

    after = next(x for x in (await ws.get("/shop/products")).json() if x["id"] == k["id"])
    assert _variant(after, "L / Red")["stock"] == 1 and _variant(after, "S / Black")["stock"] == 3 and after["orders_count"] == 2
    inv = (await app_client.get(f"/api/public/store/{s['slug']}/orders/{placed['order_id']}/invoice", params={"t": placed["token"]})).json()
    assert [line["name"] for line in inv["lines"]] == ["Cotton kurti (L / Red)", "Cotton kurti (S / Black)", "Chocolate truffle cake"]

    await ws.patch(f"/shop/orders/{order['id']}", json={"status": "cancelled"})
    back = next(x for x in (await ws.get("/shop/products")).json() if x["id"] == k["id"])
    assert _variant(back, "L / Red")["stock"] == 4 and _variant(back, "S / Black")["stock"] == 4
    assert (await app_client.post(url, json={**base, "items": []})).status_code == 422


async def test_ordering_a_variant_in_chat(wsa, meta):
    s = await _store(wsa)
    k = await _kurti(wsa)
    a = (await wsa.post("/comment-automations", json={
        "account_id": wsa.account["id"], "name": "Kurti", "media_scope": "all", "match_type": "any", "public_reply_enabled": False,
        "dm_text": "Here you go", "product_id": k["id"]})).json()
    igsid = "910000000801"
    card = await _tap_buy(wsa, meta, a, igsid)
    intro = texts(meta)[-1]
    assert "From ₹1,299" in intro and "Size: S, M, L · Colour: Red, Black" in intro

    meta.sent.clear()
    await wsa.postback(card[1]["payload"], "Order in chat", from_=igsid)
    assert texts(meta)[0] == "Which size / colour would you like?"
    assert "M / Black" not in [q["title"] for q in _quick_replies(meta)]  # sold out
    await _pick(wsa, meta, igsid, "L / Red")
    assert texts(meta)[-1] == "How many would you like?"
    await _pick(wsa, meta, igsid, "2")
    meta.sent.clear()
    await wsa.inbound("Meera Joshi\n98200 33445\n9 Hill Road, Bandra West, Mumbai 400050", from_=igsid)
    assert "Cotton kurti (L / Red) × 2 — ₹2,998" in texts(meta)[-1]
    await wsa.postback(_buttons(meta)[0]["payload"], "Cash on delivery", from_=igsid)
    order = (await wsa.get("/shop/orders")).json()["items"][0]
    assert order["source"] == "chat" and order["items"][0]["variant"] == "L / Red" and order["items"][0]["qty"] == 2 and order["total"] == 299800
    assert _variant(next(x for x in (await wsa.get("/shop/products")).json() if x["id"] == k["id"]), "L / Red")["stock"] == 2


# ---- the storefront website ---------------------------------------------------------------------------------------------------

async def test_a_new_store_gets_a_complete_website_from_its_settings(ws, app_client):
    s = await _store(ws, tagline="Fresh cakes, Pune")
    assert s["site"]["accent"] == "#e11d48" and s["site"]["hero"] == [] and all(s["site"]["sections"].values())
    cake = await _product(ws, images=["https://cdn.test/cake-2.jpg", "https://cdn.test/cake-2.jpg", " "])
    await _product(ws, name="Brownie box", price=39900, image_url="https://cdn.test/brownie.jpg")
    assert cake["images"] == ["https://cdn.test/cake-2.jpg"]  # blanks and repeats dropped
    assert (await ws.post("/shop/products", json={"name": "X", "price": 10000, "images": ["ftp://nope"]})).status_code == 422

    home = (await app_client.get(f"/api/public/store/{s['slug']}")).json()
    site = home["store"]["site"]
    assert site["announcement"] == "Free delivery on orders above ₹1,000 · Cash on delivery available"
    assert [h["title"] for h in site["hero"]] == ["Brownie box", "Chocolate truffle cake"] and site["hero"][0]["subtitle"] == "Fresh cakes, Pune"
    assert [f["q"] for f in site["faq"]] == ["Do you offer cash on delivery?", "How much is delivery?", "How do I track my order?"]
    assert home["new_arrivals"][0] != cake["id"] and home["best_sellers"] == []
    page = (await app_client.get(f"/api/public/store/{s['slug']}/products/{cake['id']}")).json()
    assert page["product"]["images"] == ["https://cdn.test/cake.jpg", "https://cdn.test/cake-2.jpg"] and [r["name"] for r in page["related"]] == ["Brownie box"]

    await app_client.post(f"/api/public/store/{s['slug']}/checkout", json=_checkout(cake["id"]))
    assert (await app_client.get(f"/api/public/store/{s['slug']}")).json()["best_sellers"] == [cake["id"]]


async def test_the_seller_customises_the_website(ws, other, app_client):
    s = await _store(ws)
    p = await _product(ws)
    body = {"accent": "#0F766E", "announcement": "Diwali sale — 20% off till Sunday 🪔",
            "hero": [{"image_url": "https://cdn.test/banner.jpg", "title": "Festive edit", "subtitle": "Handmade in Pune", "cta_label": "Shop the edit", "product_id": p["id"]}],
            "about": {"title": "Our story", "text": "Two sisters, one oven.", "image_url": "https://cdn.test/us.jpg"},
            "faq": [{"q": "Do you deliver outside Pune?", "a": "Yes, all over India."}], "sections": {"instagram": False, "bogus": True},
            "policies": {"shipping": "Ships in 2 days.", "returns": "No returns on food."}}
    r = await ws.put("/shop/site", json=body)
    assert r.status_code == 200, r.text
    saved = r.json()["site"]
    assert saved["sections"]["instagram"] is False and saved["sections"]["faq"] is True and "bogus" not in saved["sections"]

    site = (await app_client.get(f"/api/public/store/{s['slug']}")).json()["store"]["site"]
    assert site["accent"] == "#0F766E" and site["announcement"].startswith("Diwali sale") and site["hero"][0]["product_id"] == p["id"]
    assert site["faq"] == [{"q": "Do you deliver outside Pune?", "a": "Yes, all over India."}] and site["policies"]["returns"] == "No returns on food."
    # the site also reaches the other pages (header, footer, brand colour)
    assert (await app_client.get(f"/api/public/store/{s['slug']}/products/{p['id']}")).json()["store"]["site"]["accent"] == "#0F766E"

    assert (await ws.put("/shop/site", json={**body, "accent": "teal"})).status_code == 422
    foreign = await _product(other)
    assert (await ws.put("/shop/site", json={**body, "hero": [{"image_url": "https://cdn.test/b.jpg", "product_id": foreign["id"]}]})).status_code == 422
    assert (await other.put("/shop/site", json=body)).status_code == 409  # no store yet


async def test_colours_and_texts_are_the_sellers_to_choose(ws, app_client):
    s = await _store(ws)
    assert s["site"]["colors"] == {"background": "#ffffff", "text": "#171717", "surface": "#f6f6f4", "button_text": "#ffffff"}
    assert s["site"]["texts"]["add_to_cart"] == "Add to cart" and s["default_texts"]["buy_now"] == "Buy now"
    site = {**s["site"], "colors": {"background": "#0b0b0f", "text": "#fafafa", "surface": "#16161d", "button_text": "#111111"},
            "texts": {"best_sellers_title": "Sabse zyada bikne wale", "add_to_cart": "Cart mein daalo", "buy_now": "", "unknown": "x"}}
    saved = (await ws.put("/shop/site", json=site)).json()["site"]
    assert saved["colors"]["background"] == "#0b0b0f"
    assert saved["texts"]["best_sellers_title"] == "Sabse zyada bikne wale" and saved["texts"]["buy_now"] == "Buy now"  # emptied -> default
    assert "unknown" not in saved["texts"]
    public = (await app_client.get(f"/api/public/store/{s['slug']}")).json()["store"]["site"]
    assert public["colors"]["text"] == "#fafafa" and public["texts"]["add_to_cart"] == "Cart mein daalo"
    bad = await ws.put("/shop/site", json={**site, "colors": {**site["colors"], "text": "white"}})
    assert bad.status_code == 422
    assert (await ws.put("/shop/site", json={**site, "texts": {"faq_title": "x" * 81}})).status_code == 422


def test_domains_are_cleaned_up_and_get_the_right_dns_record():
    from app.services import shop_domains as d
    assert d.normalize("https://Shop.PriyaBoutique.com/collections?x=1") == "shop.priyaboutique.com"
    assert d.instructions("shop.priyaboutique.com") == {"type": "CNAME", "name": "shop", "value": "cname.vercel-dns.com"}
    assert d.instructions("priyaboutique.com") == {"type": "A", "name": "@", "value": "76.76.21.21"}
    assert d.instructions("priyaboutique.co.in")["type"] == "A" and d.instructions("store.priyaboutique.co.in")["name"] == "store"
    for bad in ("", "localhost", "priya", "my shop.com", "-bad.com", "gramforgrow.in", "x.gramforgrow.in", "me.vercel.app", "1.2.3.4"):
        try:
            d.normalize(bad)
            raise AssertionError(bad)
        except d.DomainError:
            pass


async def test_custom_domain_goes_live_once_dns_points_here(wsa, other, meta, app_client, monkeypatch):
    from app.core.config import get_settings
    from app.services import shop_domains
    dns = {"cname.vercel-dns.com": {"76.76.21.21"}}
    monkeypatch.setattr(shop_domains, "resolve", lambda host: dns.get(host, set()))
    calls: list[dict] = []
    vercel = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: (calls.append({"path": r.url.path, "body": r.content}), httpx.Response(200, json={"name": "x"}))[1]))
    monkeypatch.setattr(shop_domains, "_http_factory", lambda: vercel)
    s = get_settings()
    monkeypatch.setattr(s, "vercel_api_token", "vc-token")
    monkeypatch.setattr(s, "vercel_project_id", "prj_123")

    s_ = await _store(wsa)
    assert s_["custom_domain"] is None and s_["url"] == s_["default_url"]
    r = (await wsa.put("/shop/domain", json={"domain": "https://Shop.PriyaBoutique.com/"})).json()
    assert r["custom_domain"] == "shop.priyaboutique.com" and r["domain_status"] == "pending"
    assert r["domain_dns"] == {"type": "CNAME", "name": "shop", "value": "cname.vercel-dns.com"} and r["url"] == r["default_url"]

    not_yet = (await wsa.post("/shop/domain/check")).json()
    assert not_yet["shop"]["domain_status"] == "pending" and "doesn't point to us yet" in not_yet["message"] and calls == []
    assert (await app_client.get("/api/public/store/by-domain/shop.priyaboutique.com")).status_code == 404

    dns["shop.priyaboutique.com"] = {"76.76.21.21"}
    live = (await wsa.post("/shop/domain/check")).json()
    assert live["message"] is None and live["shop"]["domain_status"] == "active" and live["shop"]["url"] == "https://shop.priyaboutique.com"
    assert calls and calls[0]["path"] == "/v10/projects/prj_123/domains" and b"shop.priyaboutique.com" in calls[0]["body"]
    assert (await app_client.get("/api/public/store/by-domain/SHOP.priyaboutique.com:443")).json() == {"slug": s_["slug"]}
    # a plan without the shop takes the domain store down too (and back up on upgrade)
    import uuid as _uuid
    from sqlalchemy import update
    from app.models.tenant import Tenant
    from tests.conftest import db_session
    for plan, code in (("starter", 404), ("growth", 200)):
        async with await db_session() as db:
            await db.execute(update(Tenant).where(Tenant.id == _uuid.UUID(wsa.tenant_id)).values(plan_id=plan))
            await db.commit()
        assert (await app_client.get("/api/public/store/by-domain/shop.priyaboutique.com")).status_code == code

    # store links in DMs now use the domain
    p = await _product(wsa, stock=None)
    a = (await wsa.post("/comment-automations", json={"account_id": wsa.account["id"], "name": "D", "media_scope": "all", "match_type": "any",
                                                      "public_reply_enabled": False, "dm_text": "Hi", "product_id": p["id"]})).json()
    await _tap_buy(wsa, meta, a, "910000000901")
    assert _buttons(meta)[0]["url"].startswith(f"https://shop.priyaboutique.com/p/{p['id']}?r=")

    other_store = await _store(other)
    taken = await other.put("/shop/domain", json={"domain": "shop.priyaboutique.com"})
    assert taken.status_code == 409 and other_store["slug"]
    cleared = (await wsa.put("/shop/domain", json={"domain": ""})).json()
    assert cleared["custom_domain"] is None and cleared["domain_status"] == "none" and cleared["url"] == cleared["default_url"]
