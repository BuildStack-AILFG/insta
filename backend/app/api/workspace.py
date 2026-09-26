from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_tenant_id, get_current_user, get_db
from app.models.automation_flow import AutomationFlow
from app.models.contact import Contact
from app.models.plan import Plan
from app.models.tenant import Tenant, TenantMembership, User
from app.schemas.workspace import MemberOut, PlanOut, WorkspaceDetail, WorkspaceUpdate

router = APIRouter(tags=["workspace"])

MANAGER_ROLES = {"owner", "admin"}


def _plan_out(plan: Plan) -> PlanOut:
    return PlanOut(
        id=plan.id,
        name=plan.name,
        price_monthly=plan.price_monthly,
        price_quarterly=plan.price_quarterly,
        price_yearly=plan.price_yearly,
        is_default_trial=plan.is_default_trial,
        quotas=plan.quotas or {},
    )


async def _build_detail(db: AsyncSession, tenant: Tenant, user_id: uuid.UUID) -> WorkspaceDetail:
    plan = await db.get(Plan, tenant.plan_id)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Plan not found."})

    member_rows = (
        await db.execute(
            select(TenantMembership, User)
            .join(User, User.id == TenantMembership.user_id)
            .where(TenantMembership.tenant_id == tenant.id)
            .order_by(TenantMembership.created_at)
        )
    ).all()
    members = [
        MemberOut(user_id=u.id, email=u.email, full_name=u.full_name, role=m.role) for m, u in member_rows
    ]

    contacts = (await db.execute(select(func.count()).select_from(Contact).where(Contact.tenant_id == tenant.id))).scalar_one()
    flows = (
        await db.execute(select(func.count()).select_from(AutomationFlow).where(AutomationFlow.tenant_id == tenant.id))
    ).scalar_one()

    return WorkspaceDetail(
        id=tenant.id,
        name=tenant.name,
        slug=tenant.slug,
        plan=_plan_out(plan),
        quotas={**(plan.quotas or {}), **(tenant.quotas_override or {})},
        usage={"contacts": contacts, "automation_flows": flows, "team_members": len(members)},
        trial_ends_at=tenant.trial_ends_at.isoformat() if tenant.trial_ends_at else None,
        members=members,
        my_role=next((m.role for m in members if m.user_id == user_id), None),
    )


@router.get("/plans", response_model=list[PlanOut])
async def list_plans(_: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> list[PlanOut]:
    rows = (await db.execute(select(Plan))).scalars().all()
    ordered = sorted(rows, key=lambda p: (p.price_monthly is None, p.price_monthly or 0))
    return [_plan_out(p) for p in ordered]


@router.get("/workspace", response_model=WorkspaceDetail)
async def get_workspace(
    user: User = Depends(get_current_user),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceDetail:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Workspace not found."})
    return await _build_detail(db, tenant, user.id)


@router.patch("/workspace", response_model=WorkspaceDetail)
async def update_workspace(
    body: WorkspaceUpdate,
    user: User = Depends(get_current_user),
    tenant_id: uuid.UUID = Depends(get_current_tenant_id),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceDetail:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Workspace not found."})

    membership = (
        await db.execute(
            select(TenantMembership).where(TenantMembership.tenant_id == tenant_id, TenantMembership.user_id == user.id)
        )
    ).scalar_one_or_none()
    if membership is None or membership.role not in MANAGER_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Only an owner or admin can rename the workspace."})

    tenant.name = body.name.strip()
    await db.commit()
    await db.refresh(tenant)
    return await _build_detail(db, tenant, user.id)
