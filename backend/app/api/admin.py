"""
Platform admin console API: the people who run GramForGrow see every workspace, plan, payment and user, and can change plans, trials and limits.

Access is limited to the emails in PLATFORM_ADMIN_EMAILS (anyone else gets a plain 404). This is an operations view: it returns account and billing
metadata only, never message content or contact details.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import get_db, require_platform_admin
from app.models.automation_flow import AutomationFlow
from app.models.billing import Payment
from app.models.contact import Contact
from app.models.plan import Plan
from app.models.tenant import Tenant, TenantMembership, User
from app.models.instagram_account import InstagramAccount
from app.models.job import Job
from app.services import billing as billing_svc
from app.services import entitlements, jobs
from app.services.plan_catalog import FEATURES

log = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

QUOTA_KEYS = ("max_instagram_accounts", "max_team_members", "max_automation_flows", "max_contacts", "max_comment_automations",
              "ai_replies_included_per_month", "max_knowledge_sources")
QUOTA_MAX = 10_000_000
PAID_PLANS_EXCLUDED = ("free", "trial", "enterprise")


def _err(message: str, status: int = 422) -> HTTPException:
    return HTTPException(status_code=status, detail={"error": message})


def _iso(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _tenant_row(t: Tenant, plan: Plan | None, owner_email: str | None, members: int) -> dict:
    return {"id": str(t.id), "name": t.name, "slug": t.slug, "status": t.status, "plan_id": t.plan_id, "plan_name": plan.name if plan else t.plan_id,
            "trial_ends_at": _iso(t.trial_ends_at), "plan_expires_at": _iso(t.plan_expires_at), "created_at": _iso(t.created_at), "owner_email": owner_email,
            "members": members, "state": billing_svc.plan_state(t)}


async def _owner_and_counts(db: AsyncSession, ids: list[uuid.UUID]) -> tuple[dict, dict]:
    owners: dict = {}
    counts: dict = {}
    if not ids:
        return owners, counts
    rows = (await db.execute(select(TenantMembership.tenant_id, TenantMembership.role, User.email).join(User, User.id == TenantMembership.user_id)
                             .where(TenantMembership.tenant_id.in_(ids)).order_by(TenantMembership.created_at))).all()
    for tid, role, email in rows:
        counts[tid] = counts.get(tid, 0) + 1
        if role == "owner" and tid not in owners:
            owners[tid] = email
    return owners, counts


# ---- overview -----------------------------------------------------------------------------------------------------------------

@router.get("/overview")
async def overview(_: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    now = billing_svc.utcnow()
    by_plan = {pid: n for pid, n in (await db.execute(select(Tenant.plan_id, func.count()).where(Tenant.status != "deleted").group_by(Tenant.plan_id))).all()}
    total = sum(by_plan.values())
    suspended = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.status == "suspended"))).scalar_one()
    trial_active = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.plan_id == "trial", Tenant.trial_ends_at > now))).scalar_one()
    trial_expiring = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.plan_id == "trial", Tenant.trial_ends_at > now,
                                                                                      Tenant.trial_ends_at < now + timedelta(days=3)))).scalar_one()
    signups = {f"last_{d}d": (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.created_at > now - timedelta(days=d)))).scalar_one() for d in (7, 30)}
    users = (await db.execute(select(func.count()).select_from(User))).scalar_one()

    paying = (await db.execute(select(Tenant).where(Tenant.plan_id.not_in(PAID_PLANS_EXCLUDED), Tenant.plan_expires_at > now))).scalars().all()
    mrr = 0
    if paying:
        latest: dict = {}
        for p in (await db.execute(select(Payment).where(Payment.tenant_id.in_([t.id for t in paying]), Payment.status == "paid").order_by(Payment.paid_at.desc()))).scalars():
            latest.setdefault(p.tenant_id, p)
        mrr = sum(round((p.base_amount - p.credit_amount) / max(p.months, 1)) for p in latest.values())
    revenue_30 = (await db.execute(select(func.coalesce(func.sum(Payment.total_amount), 0)).where(Payment.status == "paid", Payment.paid_at > now - timedelta(days=30)))).scalar_one()
    revenue_all = (await db.execute(select(func.coalesce(func.sum(Payment.total_amount), 0)).where(Payment.status == "paid"))).scalar_one()

    recent = (await db.execute(select(Tenant).order_by(Tenant.created_at.desc()).limit(8))).scalars().all()
    owners, counts = await _owner_and_counts(db, [t.id for t in recent])
    plans = {p.id: p for p in (await db.execute(select(Plan))).scalars().all()}
    pays = (await db.execute(select(Payment, Tenant.name).join(Tenant, Tenant.id == Payment.tenant_id).where(Payment.status == "paid").order_by(Payment.paid_at.desc()).limit(8))).all()
    return {
        "workspaces": {"total": total, "by_plan": by_plan, "suspended": suspended, "trial_active": trial_active, "trial_expiring_3d": trial_expiring, "paying": len(paying)},
        "signups": signups, "users": users,
        "revenue": {"currency": "INR", "mrr": mrr, "last_30_days": revenue_30, "all_time": revenue_all},
        "recent_workspaces": [_tenant_row(t, plans.get(t.plan_id), owners.get(t.id), counts.get(t.id, 0)) for t in recent],
        "recent_payments": [{"id": str(p.id), "workspace": name, "plan_id": p.plan_id, "months": p.months, "total_amount": p.total_amount, "invoice_number": p.invoice_number, "paid_at": _iso(p.paid_at)} for p, name in pays],
    }


# ---- workspaces ---------------------------------------------------------------------------------------------------------------

@router.get("/workspaces")
async def list_workspaces(q: str = "", plan: str = "", status: str = "", limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0),
                          _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    query = select(Tenant).where(Tenant.status != "deleted")
    if q.strip():
        like = f"%{q.strip()}%"
        by_email = select(TenantMembership.tenant_id).join(User, User.id == TenantMembership.user_id).where(User.email.ilike(like))
        query = query.where(or_(Tenant.name.ilike(like), Tenant.slug.ilike(like), Tenant.id.in_(by_email)))
    if plan:
        query = query.where(Tenant.plan_id == plan)
    if status in ("active", "suspended"):
        query = query.where(Tenant.status == status)
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.order_by(Tenant.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    owners, counts = await _owner_and_counts(db, [t.id for t in rows])
    plans = {p.id: p for p in (await db.execute(select(Plan))).scalars().all()}
    return {"total": total, "items": [_tenant_row(t, plans.get(t.plan_id), owners.get(t.id), counts.get(t.id, 0)) for t in rows]}


async def _detail(db: AsyncSession, t: Tenant) -> dict:
    plan = await db.get(Plan, t.plan_id)
    members = (await db.execute(select(TenantMembership.role, User).join(User, User.id == TenantMembership.user_id).where(TenantMembership.tenant_id == t.id)
                                .order_by(TenantMembership.created_at))).all()
    owner = next((u.email for role, u in members if role == "owner"), None)
    count = lambda model: db.execute(select(func.count()).select_from(model).where(model.tenant_id == t.id))  # noqa: E731
    contacts, flows, numbers = (await count(Contact)).scalar_one(), (await count(AutomationFlow)).scalar_one(), (await count(InstagramAccount)).scalar_one()
    pays = (await db.execute(select(Payment).where(Payment.tenant_id == t.id, Payment.status == "paid").order_by(Payment.paid_at.desc()).limit(50))).scalars().all()
    return {
        **_tenant_row(t, plan, owner, len(members)),
        "quotas": {**((plan.quotas if plan else None) or {}), **(t.quotas_override or {})}, "quotas_override": t.quotas_override or {},
        "features": entitlements.features_of(plan),
        "usage": {"contacts": contacts, "automation_flows": flows, "team_members": len(members), "instagram_accounts": numbers},
        "members": [{"user_id": str(u.id), "email": u.email, "full_name": u.full_name, "role": role, "last_login_at": _iso(u.last_login_at), "is_active": u.is_active} for role, u in members],
        "payments": [{"id": str(p.id), "plan_id": p.plan_id, "months": p.months, "total_amount": p.total_amount, "invoice_number": p.invoice_number, "paid_at": _iso(p.paid_at)} for p in pays],
    }


async def _get_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> Tenant:
    t = await db.get(Tenant, tenant_id)
    if t is None or t.status == "deleted":
        raise _err("Workspace not found.", 404)
    return t


@router.get("/workspaces/{tenant_id}")
async def workspace_detail(tenant_id: uuid.UUID, _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    return await _detail(db, await _get_tenant(db, tenant_id))


class WorkspacePatch(BaseModel):
    plan_id: str | None = None
    status: str | None = None
    extend_trial_days: int | None = Field(default=None, ge=1, le=365)
    trial_ends_at: datetime | None = None
    plan_expires_at: datetime | None = None
    clear_plan_expiry: bool = False
    quotas_override: dict[str, int] | None = None


@router.patch("/workspaces/{tenant_id}")
async def update_workspace(tenant_id: uuid.UUID, body: WorkspacePatch, admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    t = await _get_tenant(db, tenant_id)
    now = billing_svc.utcnow()
    changes: list[str] = []
    if body.status is not None:
        if body.status not in ("active", "suspended"):
            raise _err("Status must be active or suspended.")
        t.status = body.status
        changes.append(f"status={body.status}")
    if body.plan_id is not None and body.plan_id != t.plan_id:
        if await db.get(Plan, body.plan_id) is None:
            raise _err("That plan doesn't exist.")
        t.plan_id = body.plan_id
        changes.append(f"plan={body.plan_id}")
        if body.plan_id == "trial" and body.trial_ends_at is None and body.extend_trial_days is None:
            t.trial_ends_at = now + timedelta(days=await entitlements.trial_days(db))
        if body.plan_id in ("free", "trial"):
            t.plan_expires_at = None  # no paid period on an unpaid plan
    if body.extend_trial_days:
        base = t.trial_ends_at if t.trial_ends_at and t.trial_ends_at > now else now
        t.trial_ends_at = base + timedelta(days=body.extend_trial_days)
        changes.append(f"trial+{body.extend_trial_days}d")
    if body.trial_ends_at is not None:
        t.trial_ends_at = body.trial_ends_at
        changes.append("trial_ends_at")
    if body.clear_plan_expiry:
        t.plan_expires_at = None
        changes.append("plan_expiry cleared")
    elif body.plan_expires_at is not None:
        t.plan_expires_at = body.plan_expires_at
        changes.append("plan_expires_at")
    if body.quotas_override is not None:
        bad = [k for k, v in body.quotas_override.items() if k not in QUOTA_KEYS or v < -1 or v > QUOTA_MAX]
        if bad:
            raise _err(f"Unknown or out-of-range limit: {', '.join(bad)}.")
        t.quotas_override = body.quotas_override or None
        flag_modified(t, "quotas_override")
        changes.append("limits")
    await db.commit()
    log.info("admin %s updated workspace %s: %s", admin.email, t.id, ", ".join(changes) or "no changes")
    return await _detail(db, t)


# ---- plans & platform settings ------------------------------------------------------------------------------------------------

def _plan_out(p: Plan, workspaces: int) -> dict:
    return {"id": p.id, "name": p.name, "price_monthly": p.price_monthly, "price_quarterly": p.price_quarterly, "price_yearly": p.price_yearly,
            "quotas": p.quotas or {}, "features": entitlements.features_of(p), "is_public": p.is_public, "workspaces": workspaces,
            "purchasable": billing_svc.is_purchasable(p)}


@router.get("/plans")
async def list_plans(_: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    counts = {pid: n for pid, n in (await db.execute(select(Tenant.plan_id, func.count()).where(Tenant.status != "deleted").group_by(Tenant.plan_id))).all()}
    order = {"trial": 0, "free": 1, "starter": 2, "growth": 3, "scale": 4, "enterprise": 5}
    plans = sorted((await db.execute(select(Plan))).scalars().all(), key=lambda p: (order.get(p.id, 9), p.id))
    return {"plans": [_plan_out(p, counts.get(p.id, 0)) for p in plans], "feature_catalog": FEATURES, "quota_keys": list(QUOTA_KEYS),
            "trial_days": await entitlements.trial_days(db)}


class PlanPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    price_monthly: int | None = Field(default=None, ge=0, le=100_000_00)
    price_quarterly: int | None = Field(default=None, ge=0, le=100_000_00)
    price_yearly: int | None = Field(default=None, ge=0, le=100_000_00)
    clear_prices: bool = False
    quotas: dict[str, int] | None = None
    features: dict[str, bool] | None = None
    is_public: bool | None = None


@router.put("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanPatch, admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    p = await db.get(Plan, plan_id)
    if p is None:
        raise _err("Plan not found.", 404)
    if body.name is not None:
        p.name = body.name.strip()
    if plan_id in ("free", "trial") and (body.price_monthly or body.price_quarterly or body.price_yearly):
        raise _err("The free and trial plans can't have a price.")
    if body.clear_prices:
        p.price_monthly = p.price_quarterly = p.price_yearly = None
    else:
        for field in ("price_monthly", "price_quarterly", "price_yearly"):
            if getattr(body, field) is not None:
                setattr(p, field, getattr(body, field) or None)
    if body.quotas is not None:
        bad = [k for k, v in body.quotas.items() if k not in QUOTA_KEYS or v < -1 or v > QUOTA_MAX]
        if bad:
            raise _err(f"Unknown or out-of-range limit: {', '.join(bad)}.")
        p.quotas = {**(p.quotas or {}), **body.quotas}
        flag_modified(p, "quotas")
    if body.features is not None:
        unknown = [k for k in body.features if k not in FEATURES]
        if unknown:
            raise _err(f"Unknown feature: {', '.join(unknown)}.")
        p.features = {**{k: True for k in FEATURES}, **(p.features or {}), **body.features}
        flag_modified(p, "features")
    if body.is_public is not None:
        p.is_public = body.is_public
    await db.commit()
    log.info("admin %s updated plan %s", admin.email, plan_id)
    count = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.plan_id == plan_id))).scalar_one()
    return _plan_out(p, count)


class SettingsPatch(BaseModel):
    trial_days: int = Field(ge=1, le=365)


@router.put("/settings")
async def update_settings(body: SettingsPatch, admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    await entitlements.set_setting(db, entitlements.TRIAL_DAYS_KEY, body.trial_days)
    log.info("admin %s set the trial length to %s days", admin.email, body.trial_days)
    return {"trial_days": body.trial_days}


# ---- payments & users ---------------------------------------------------------------------------------------------------------

@router.get("/payments")
async def list_payments(limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                        _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    total = (await db.execute(select(func.count()).select_from(Payment).where(Payment.status == "paid"))).scalar_one()
    rows = (await db.execute(select(Payment, Tenant.name).join(Tenant, Tenant.id == Payment.tenant_id).where(Payment.status == "paid")
                             .order_by(Payment.paid_at.desc()).limit(limit).offset(offset))).all()
    return {"total": total, "items": [{"id": str(p.id), "workspace_id": str(p.tenant_id), "workspace": name, "plan_id": p.plan_id, "interval": p.interval, "months": p.months,
                                       "base_amount": p.base_amount, "gst_amount": p.gst_amount, "total_amount": p.total_amount, "method": p.method,
                                       "invoice_number": p.invoice_number, "paid_at": _iso(p.paid_at)} for p, name in rows]}


@router.get("/users")
async def list_users(q: str = "", limit: int = Query(default=25, ge=1, le=100), offset: int = Query(default=0, ge=0),
                     _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    query = select(User)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.where(or_(User.email.ilike(like), User.full_name.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    users = (await db.execute(query.order_by(User.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    ws: dict = {}
    if users:
        for uid, name, role in (await db.execute(select(TenantMembership.user_id, Tenant.name, TenantMembership.role).join(Tenant, Tenant.id == TenantMembership.tenant_id)
                                                 .where(TenantMembership.user_id.in_([u.id for u in users])))).all():
            ws.setdefault(uid, []).append({"name": name, "role": role})
    return {"total": total, "items": [{"id": str(u.id), "email": u.email, "full_name": u.full_name, "is_active": u.is_active, "created_at": _iso(u.created_at),
                                       "last_login_at": _iso(u.last_login_at), "workspaces": ws.get(u.id, [])} for u in users]}


class UserPatch(BaseModel):
    is_active: bool


@router.patch("/users/{user_id}")
async def update_user(user_id: uuid.UUID, body: UserPatch, admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    u = await db.get(User, user_id)
    if u is None:
        raise _err("User not found.", 404)
    if u.id == admin.id and not body.is_active:
        raise _err("You can't deactivate your own account.")
    u.is_active = body.is_active
    await db.commit()
    log.info("admin %s set user %s active=%s", admin.email, u.id, u.is_active)
    return {"id": str(u.id), "is_active": u.is_active}


# ---- background jobs (webhook follow-up work) ---------------------------------------------------------------------------------

@router.get("/jobs")
async def list_jobs(status: str = Query(default="failed", pattern="^(pending|running|done|failed)$"), limit: int = Query(default=50, ge=1, le=200),
                    _: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    counts = dict((await db.execute(select(Job.status, func.count()).group_by(Job.status))).all())
    rows = (await db.execute(select(Job).where(Job.status == status).order_by(Job.updated_at.desc()).limit(limit))).scalars().all()
    return {"counts": counts, "items": [{"id": str(j.id), "kind": j.kind, "status": j.status, "attempts": j.attempts, "last_error": j.last_error,
                                         "created_at": _iso(j.created_at), "updated_at": _iso(j.updated_at)} for j in rows]}


@router.post("/jobs/{job_id}/retry")
async def retry_job(job_id: uuid.UUID, admin: User = Depends(require_platform_admin), db: AsyncSession = Depends(get_db)) -> dict:
    if not await jobs.retry(db, job_id):
        raise _err("Only failed jobs can be retried.", 409)
    log.info("admin %s re-queued job %s", admin.email, job_id)
    return {"id": str(job_id), "status": "pending"}
