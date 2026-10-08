"""Plan feature switches (trial vs paid), the public price list, the platform admin console, and that admin plan edits survive the boot-time seed."""

from __future__ import annotations

import os
import subprocess
import sys
import uuid

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.models.tenant import Tenant
from tests.conftest import ROOT, db_session

LOCKED_ON_TRIAL = ("conversation_analytics", "automation_reports", "sales_reports", "assignment_rules", "api_access", "integrations")
LOCKED_ENDPOINTS = [("get", "/developer/keys"), ("get", "/integrations"), ("get", "/analytics/overview"), ("get", "/pipeline/report")]
# Growth-tier tools: locked on the trial, the free plan and Starter.
GROWTH_ONLY = ("shop", "giveaways", "intent_matching", "segments", "pipeline")
GROWTH_ENDPOINTS = [("get", "/giveaways"), ("get", "/segments"), ("get", "/pipeline/stages")]


@pytest.fixture
def admin_emails():
    """Make chosen emails platform admins for one test."""
    s = get_settings()
    saved = list(s.platform_admin_emails)

    def grant(*emails: str) -> None:
        s.platform_admin_emails = [e.lower() for e in emails]
    yield grant
    s.platform_admin_emails = saved


async def set_plan(ws, plan_id: str, **fields) -> None:
    async with await db_session() as db:
        tenant = await db.get(Tenant, uuid.UUID(ws.tenant_id))
        tenant.plan_id = plan_id
        for k, v in fields.items():
            setattr(tenant, k, v)
        await db.commit()


# ---- feature switches ----------------------------------------------------------------------------------------------------------

async def test_trial_locks_advanced_features_but_keeps_the_ai_agent(ws):
    me = (await ws.get("/auth/me")).json()
    f = me["workspace"]["features"]
    assert me["workspace"]["plan_state"]["kind"] == "trial" and me["is_platform_admin"] is False
    assert all(f[k] is False for k in LOCKED_ON_TRIAL)
    assert f["ai_agent"] is True  # the WhatsApp AI agent stays available on the free trial


@pytest.mark.parametrize("method,path", LOCKED_ENDPOINTS)
async def test_locked_endpoints_answer_402_with_an_upgrade_message(ws, method, path):
    r = await getattr(ws, method)(path)
    assert r.status_code == 402, (path, r.text)
    detail = r.json()["detail"]
    assert detail["upgrade"] is True and "Upgrade your plan to access this" in detail["error"] and detail["feature"]


async def test_assignment_rules_are_locked_on_trial_but_other_settings_still_save(ws):
    r = await ws.patch("/settings", json={"settings": {"assignment": {"mode": "round_robin"}}})
    assert r.status_code == 402 and r.json()["detail"]["feature"] == "assignment_rules"
    assert (await ws.patch("/settings", json={"settings": {"default_country_code": "91"}})).status_code == 200


async def test_starter_unlocks_the_trial_locks_but_not_growth_tier_tools(ws):
    await set_plan(ws, "starter")
    f = (await ws.get("/auth/me")).json()["workspace"]["features"]
    assert all(f[k] for k in LOCKED_ON_TRIAL)
    assert not any(f[k] for k in GROWTH_ONLY)
    for method, path in LOCKED_ENDPOINTS:
        if path != "/pipeline/report":  # the report lives under the pipeline, which Starter doesn't include
            assert (await getattr(ws, method)(path)).status_code == 200, path
    for method, path in GROWTH_ENDPOINTS:
        r = await getattr(ws, method)(path)
        assert r.status_code == 402 and r.json()["detail"]["upgrade"] is True, path
    r = await ws.patch("/settings", json={"settings": {"intent_matching_enabled": True}})
    assert r.status_code == 402 and r.json()["detail"]["feature"] == "intent_matching"


async def test_growth_unlocks_everything(ws):
    await set_plan(ws, "growth")
    f = (await ws.get("/auth/me")).json()["workspace"]["features"]
    assert all(f.values())
    for method, path in LOCKED_ENDPOINTS + GROWTH_ENDPOINTS:
        assert (await getattr(ws, method)(path)).status_code == 200, path


async def test_trial_is_capped_at_five_comment_automations(ws):
    plans = (await ws.get("/billing")).json()  # the trial's cap comes from the plan row, not code
    assert plans["plan"]["kind"] == "trial"
    trial = (await ws.get("/workspace")).json()["quotas"]
    assert trial["max_comment_automations"] == 5 and trial["max_instagram_accounts"] == 1 and trial["ai_replies_included_per_month"] > 0


async def test_billing_overview_offers_only_plans_on_sale(ws):
    ids = [p["id"] for p in (await ws.get("/billing")).json()["plans"]]
    assert ids == ["starter", "growth", "enterprise"]  # the retired Scale tier, Free and Trial are never offered


# ---- public price list ---------------------------------------------------------------------------------------------------------

async def test_public_plans_lists_only_what_is_for_sale(app_client):
    r = await app_client.get("/api/public/plans")
    assert r.status_code == 200
    body = r.json()
    ids = [p["id"] for p in body["plans"]]
    assert ids == ["starter", "growth", "enterprise"]  # no free / trial / retired scale
    starter, growth, enterprise = body["plans"]
    assert starter["per_month"]["monthly"] == 79900 and growth["per_month"]["monthly"] == 129900 and enterprise["per_month"]["monthly"] is None
    assert body["trial"]["days"] == 14 and body["trial"]["features"]["api_access"] is False and body["trial"]["features"]["ai_agent"] is True
    assert "conversation_analytics" in body["feature_catalog"]


# ---- platform admin ------------------------------------------------------------------------------------------------------------

async def test_admin_console_is_invisible_to_everyone_else(ws):
    import httpx
    from app.main import app
    for path in ("/admin/overview", "/admin/workspaces", "/admin/plans", "/admin/payments", "/admin/users"):
        assert (await ws.get(path)).status_code == 404, path
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://api.test") as anon:  # no auth cookie
        assert (await anon.get("/api/admin/overview")).status_code == 401


async def test_admin_overview_and_workspace_search(ws, other, admin_emails):
    admin_emails(ws.email)
    assert (await ws.get("/auth/me")).json()["is_platform_admin"] is True
    ov = (await ws.get("/admin/overview")).json()
    assert ov["workspaces"]["total"] >= 2 and ov["workspaces"]["trial_active"] >= 2 and "mrr" in ov["revenue"]
    found = (await ws.get("/admin/workspaces", params={"q": other.email})).json()
    assert [w["id"] for w in found["items"]] == [other.tenant_id] and found["items"][0]["owner_email"] == other.email
    assert all(w["plan_id"] == "trial" for w in (await ws.get("/admin/workspaces", params={"plan": "trial"})).json()["items"])
    detail = (await ws.get(f"/admin/workspaces/{other.tenant_id}")).json()
    assert detail["usage"]["team_members"] == 1 and detail["features"]["api_access"] is False and detail["members"][0]["email"] == other.email


async def test_admin_can_change_plan_extend_trial_and_override_limits(ws, other, admin_emails):
    admin_emails(ws.email)
    before = (await ws.get(f"/admin/workspaces/{other.tenant_id}")).json()["trial_ends_at"]
    r = await ws.patch(f"/admin/workspaces/{other.tenant_id}", json={"extend_trial_days": 10})
    assert r.status_code == 200 and r.json()["trial_ends_at"] > before

    r = await ws.patch(f"/admin/workspaces/{other.tenant_id}", json={"plan_id": "growth", "quotas_override": {"max_contacts": 12345}})
    body = r.json()
    assert body["plan_id"] == "growth" and body["quotas"]["max_contacts"] == 12345 and all(body["features"].values())
    assert (await other.get("/developer/keys")).status_code == 200  # the customer sees the unlock immediately
    assert (await other.get("/auth/me")).json()["workspace"]["plan_state"]["kind"] == "custom"  # granted by hand, no expiry

    assert (await ws.patch(f"/admin/workspaces/{other.tenant_id}", json={"plan_id": "nope"})).status_code == 422
    assert (await ws.patch(f"/admin/workspaces/{other.tenant_id}", json={"quotas_override": {"bogus": 1}})).status_code == 422
    back = (await ws.patch(f"/admin/workspaces/{other.tenant_id}", json={"plan_id": "trial"})).json()
    assert back["plan_id"] == "trial" and back["state"]["kind"] == "trial" and back["plan_expires_at"] is None


async def test_suspending_a_workspace_blocks_its_users_until_reactivated(ws, other, admin_emails, app_client):
    admin_emails(ws.email)
    assert (await ws.patch(f"/admin/workspaces/{other.tenant_id}", json={"status": "suspended"})).json()["status"] == "suspended"
    r = await other.get("/contacts")
    assert r.status_code == 403 and r.json()["detail"]["suspended"] is True
    login = await app_client.post("/api/auth/login", json={"email": other.email, "password": "Str0ng!Passw0rd#42"})
    assert login.status_code == 403 and "suspended" in login.json()["detail"]["error"]
    await ws.patch(f"/admin/workspaces/{other.tenant_id}", json={"status": "active"})
    assert (await other.get("/contacts")).status_code == 200


async def test_admin_plan_edits_show_on_the_public_price_list_and_survive_the_seed(ws, app_client, admin_emails):
    admin_emails(ws.email)
    plans = (await ws.get("/admin/plans")).json()
    assert {p["id"] for p in plans["plans"]} >= {"trial", "free", "starter", "growth", "scale", "enterprise"} and plans["trial_days"] == 14

    try:
        r = await ws.put("/admin/plans/starter", json={"price_monthly": 84900, "quotas": {"max_contacts": 2500}, "features": {"sales_reports": False}})
        assert r.status_code == 200 and r.json()["price_monthly"] == 84900 and r.json()["features"]["sales_reports"] is False
        assert (await ws.put("/admin/plans/starter", json={"features": {"nonsense": True}})).status_code == 422
        assert (await ws.put("/admin/plans/trial", json={"price_monthly": 500})).status_code == 422

        subprocess.run([sys.executable, "scripts/seed_plans.py"], cwd=ROOT, env={**os.environ}, check=True, capture_output=True)  # what every deploy runs
        starter = next(p for p in (await app_client.get("/api/public/plans")).json()["plans"] if p["id"] == "starter")
        assert starter["per_month"]["monthly"] == 84900 and starter["quotas"]["max_contacts"] == 2500 and starter["features"]["sales_reports"] is False
    finally:
        await ws.put("/admin/plans/starter", json={"price_monthly": 79900, "quotas": {"max_contacts": 2000}, "features": {"sales_reports": True}})


async def test_admin_sets_the_trial_length_for_new_signups(ws, app_client, admin_emails):
    admin_emails(ws.email)
    try:
        assert (await ws.put("/admin/settings", json={"trial_days": 7})).json() == {"trial_days": 7}
        assert (await ws.put("/admin/settings", json={"trial_days": 0})).status_code == 422
        email = f"new-{uuid.uuid4().hex[:8]}@example.com"
        r = await app_client.post("/api/auth/register", json={"company_name": "Seven Day Co", "email": email, "password": "Str0ng!Passw0rd#42"})
        assert r.status_code == 201
        assert r.json()["workspace"]["trial_ends_at"] is not None
        days = (await ws.get("/admin/workspaces", params={"q": email})).json()["items"][0]["state"]["days_left"]
        assert days == 7
        assert (await app_client.get("/api/public/plans")).json()["trial"]["days"] == 7
    finally:
        await ws.put("/admin/settings", json={"trial_days": 14})


async def test_admin_payments_and_users_lists_and_deactivation(ws, other, admin_emails):
    admin_emails(ws.email)
    assert (await ws.get("/admin/payments")).json()["total"] >= 0
    users = (await ws.get("/admin/users", params={"q": other.email})).json()
    assert users["total"] == 1 and users["items"][0]["workspaces"][0]["role"] == "owner"
    uid = users["items"][0]["id"]
    assert (await ws.patch(f"/admin/users/{uid}", json={"is_active": False})).json()["is_active"] is False
    assert (await other.get("/auth/me")).status_code == 401  # deactivated accounts lose access immediately
    assert (await ws.patch(f"/admin/users/{ws.user_id}", json={"is_active": False})).status_code == 422  # can't lock yourself out
    async with await db_session() as db:
        assert (await db.execute(select(Tenant).where(Tenant.id == uuid.UUID(other.tenant_id)))).scalar_one().status == "active"
