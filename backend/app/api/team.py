"""Team: members, roles, invitations."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_manager
from app.core import ratelimit
from app.core.config import get_settings
from app.core.password_policy import evaluate_password
from app.core.security import hash_password, issue_token_pair
from app.models.conversation import Conversation
from app.models.plan import Plan
from app.models.team_invite import TeamInvite
from app.models.tenant import Tenant, TenantMembership, User
from app.services import auth_service, mailer, quotas

router = APIRouter(prefix="/team", tags=["team"])

Role = Literal["admin", "agent", "viewer"]
INVITE_TTL = timedelta(days=7)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _link(token: str) -> str:
    return f"{get_settings().frontend_url.rstrip('/')}/accept-invite?token={token}"


@router.get("/members")
async def members(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(TenantMembership, User).join(User, User.id == TenantMembership.user_id)
                             .where(TenantMembership.tenant_id == ctx.tenant_id).order_by(TenantMembership.created_at))).all()
    return [{"user_id": str(u.id), "email": u.email, "full_name": u.full_name, "role": m.role, "is_you": u.id == ctx.user_id, "active": u.is_active,
             "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None} for m, u in rows]


class RoleIn(BaseModel):
    role: Literal["owner", "admin", "agent", "viewer"]


async def _membership(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID) -> TenantMembership:
    m = (await db.execute(select(TenantMembership).where(TenantMembership.tenant_id == tenant_id, TenantMembership.user_id == user_id))).scalar_one_or_none()
    if m is None:
        raise HTTPException(status_code=404, detail={"error": "Team member not found."})
    return m


async def _owner_count(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return (await db.execute(select(func.count()).select_from(TenantMembership).where(TenantMembership.tenant_id == tenant_id, TenantMembership.role == "owner"))).scalar_one()


@router.patch("/members/{user_id}")
async def change_role(user_id: uuid.UUID, body: RoleIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    m = await _membership(db, ctx.tenant_id, user_id)
    # Only owners may touch owner/admin roles; admins manage agents and viewers.
    if ctx.role != "owner" and ({m.role, body.role} & {"owner", "admin"}):
        raise HTTPException(status_code=403, detail={"error": "Only the workspace owner can change owner or admin roles."})
    if m.role == "owner" and body.role != "owner" and await _owner_count(db, ctx.tenant_id) <= 1:
        raise HTTPException(status_code=409, detail={"error": "A workspace needs at least one owner. Promote someone else to owner first."})
    m.role = body.role
    await db.commit()
    return {"user_id": str(user_id), "role": m.role}


@router.delete("/members/{user_id}", status_code=204, response_model=None)
async def remove_member(user_id: uuid.UUID, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    m = await _membership(db, ctx.tenant_id, user_id)
    if m.user_id == ctx.user_id:
        raise HTTPException(status_code=409, detail={"error": "You can't remove yourself."})
    if ctx.role != "owner" and m.role in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail={"error": "Only the workspace owner can remove owners or admins."})
    if m.role == "owner" and await _owner_count(db, ctx.tenant_id) <= 1:
        raise HTTPException(status_code=409, detail={"error": "You can't remove the only owner."})
    await db.execute(update(Conversation).where(Conversation.tenant_id == ctx.tenant_id, Conversation.assigned_user_id == user_id).values(assigned_user_id=None))
    await db.delete(m)
    await db.commit()


# ---- invitations ----------------------------------------------------------------------------------------------------------------

class InviteIn(BaseModel):
    email: EmailStr
    role: Role = "agent"


def _invite_out(i: TeamInvite) -> dict:
    return {"id": str(i.id), "email": i.email, "role": i.role, "expires_at": i.expires_at.isoformat(), "created_at": i.created_at.isoformat() if i.created_at else None,
            "expired": i.expires_at < datetime.now(timezone.utc)}


@router.get("/invites")
async def list_invites(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(TeamInvite).where(TeamInvite.tenant_id == ctx.tenant_id, TeamInvite.accepted_at.is_(None)).order_by(TeamInvite.created_at.desc()))).scalars().all()
    return [_invite_out(i) for i in rows]


@router.post("/invites", status_code=status.HTTP_201_CREATED)
async def invite(body: InviteIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    if ctx.role != "owner" and body.role == "admin":
        raise HTTPException(status_code=403, detail={"error": "Only the workspace owner can invite admins."})
    email = body.email.lower()
    already = (await db.execute(select(TenantMembership.id).join(User, User.id == TenantMembership.user_id).where(TenantMembership.tenant_id == ctx.tenant_id, User.email == email))).first()
    if already:
        raise HTTPException(status_code=409, detail={"error": "That person is already on your team."})
    members_n = (await db.execute(select(func.count()).select_from(TenantMembership).where(TenantMembership.tenant_id == ctx.tenant_id))).scalar_one()
    pending = (await db.execute(select(TeamInvite).where(TeamInvite.tenant_id == ctx.tenant_id, TeamInvite.accepted_at.is_(None), TeamInvite.expires_at > datetime.now(timezone.utc)))).scalars().all()
    others = [p for p in pending if p.email != email]
    await quotas.enforce(db, ctx.tenant_id, "max_team_members", members_n + len(others), label="team members")

    for p in pending:  # re-inviting replaces the earlier link
        if p.email == email:
            await db.delete(p)
    token = secrets.token_urlsafe(32)
    row = TeamInvite(tenant_id=ctx.tenant_id, email=email, role=body.role, token_hash=_hash(token), invited_by=ctx.user_id, expires_at=datetime.now(timezone.utc) + INVITE_TTL)
    db.add(row)
    await db.commit()
    await db.refresh(row)

    tenant = await db.get(Tenant, ctx.tenant_id)
    link = _link(token)
    sent = await mailer.send(email, f"You're invited to {tenant.name} on LeadForGrow",
                             mailer.button_html("Join your team", f"You've been invited to join <b>{tenant.name}</b> as {body.role}. This link expires in 7 days.", "Accept invitation", link))
    # When email isn't configured the inviter gets the link to share manually — never silently lose the invite.
    return {**_invite_out(row), "email_sent": sent, "invite_link": None if sent else link}


@router.delete("/invites/{invite_id}", status_code=204, response_model=None)
async def revoke(invite_id: uuid.UUID, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    i = await db.get(TeamInvite, invite_id)
    if i is None or i.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Invitation not found."})
    await db.delete(i)
    await db.commit()


# ---- public: accept ---------------------------------------------------------------------------------------------------------------

async def _valid_invite(db: AsyncSession, token: str) -> TeamInvite:
    i = (await db.execute(select(TeamInvite).where(TeamInvite.token_hash == _hash(token)))).scalar_one_or_none()
    if i is None or i.accepted_at is not None or i.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail={"error": "This invitation is invalid or has expired. Ask your admin to send a new one."})
    return i


@router.get("/invite/{token}")
async def invite_info(token: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    ratelimit.limit(request, "invite-info", 30, 60)
    i = await _valid_invite(db, token)
    tenant = await db.get(Tenant, i.tenant_id)
    existing = (await db.execute(select(User.id).where(User.email == i.email))).first() is not None
    return {"email": i.email, "role": i.role, "workspace": tenant.name, "account_exists": existing}


class AcceptIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=128)


@router.post("/invite/{token}/accept", status_code=201)
async def accept(token: str, body: AcceptIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    ratelimit.limit(request, "invite-accept", 10, 60)
    i = await _valid_invite(db, token)
    if (await db.execute(select(User.id).where(User.email == i.email))).first() is not None:
        raise HTTPException(status_code=409, detail={"error": "An account with this email already exists. Sign in with it instead — workspace switching for existing accounts isn't available yet."})
    check = evaluate_password(body.password, email=i.email, name=body.full_name)
    if not check.ok:
        raise HTTPException(status_code=400, detail={"error": check.failures[0]["message"] if check.failures else "Weak password.", "password_failures": check.failures})

    tenant = await db.get(Tenant, i.tenant_id)
    plan = await db.get(Plan, tenant.plan_id)
    limit = ((plan.quotas if plan else {}) | (tenant.quotas_override or {})).get("max_team_members")
    n = (await db.execute(select(func.count()).select_from(TenantMembership).where(TenantMembership.tenant_id == tenant.id))).scalar_one()
    if limit is not None and 0 <= limit <= n:
        raise HTTPException(status_code=402, detail={"error": "This workspace has reached its team member limit."})

    user = User(email=i.email, password_hash=hash_password(body.password), full_name=body.full_name.strip(), password_updated_at=datetime.now(timezone.utc), last_login_at=datetime.now(timezone.utc))
    db.add(user)
    await db.flush()
    membership = TenantMembership(tenant_id=tenant.id, user_id=user.id, role=i.role)
    db.add(membership)
    i.accepted_at = datetime.now(timezone.utc)
    await db.flush()
    tokens = issue_token_pair(user_id=user.id, tenant_id=tenant.id, role=membership.role, plan_id=tenant.plan_id)
    await auth_service._store_refresh_token(db, user_id=user.id, tokens=tokens, user_agent=request.headers.get("user-agent"), ip_address=request.client.host if request.client else None)
    await db.commit()
    return {"user_id": str(user.id), "email": user.email, "role": membership.role,
            "workspace": {"id": str(tenant.id), "name": tenant.name, "slug": tenant.slug, "plan_id": tenant.plan_id,
                          "trial_ends_at": tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None},
            "access_token": tokens.access_token, "refresh_token": tokens.refresh_token, "expires_in_minutes": tokens.expires_in_minutes, "must_rotate_password": False}

