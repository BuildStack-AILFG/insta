"""What a workspace's plan lets it do: feature switches (this module) and volume quotas (services/quotas.py)."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db
from app.models.plan import Plan
from app.models.platform import PlatformSetting
from app.models.tenant import Tenant
from app.services.plan_catalog import FEATURES, TRIAL_DAYS_DEFAULT

TRIAL_DAYS_KEY = "trial_days"


def features_of(plan: Plan | None) -> dict[str, bool]:
    """Every catalogue feature -> on/off for this plan. A feature the plan doesn't mention is on."""
    stored = (plan.features if plan else None) or {}
    return {key: bool(stored.get(key, True)) for key in FEATURES}


async def features_for(db: AsyncSession, tenant: Tenant) -> dict[str, bool]:
    return features_of(await db.get(Plan, tenant.plan_id))


def upgrade_error(feature: str) -> HTTPException:
    label = FEATURES.get(feature, {}).get("label", "This feature")
    return HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={"error": f"{label} isn't included in your current plan. Upgrade your plan to access this.", "feature": feature, "upgrade": True},
    )


async def ensure_feature(db: AsyncSession, tenant_id: uuid.UUID, feature: str) -> None:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is not None and not (await features_for(db, tenant)).get(feature, True):
        raise upgrade_error(feature)


def require_feature(feature: str):
    """Router dependency: 402 with an 'upgrade your plan' message when the workspace's plan has `feature` switched off."""
    async def dep(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> Ctx:
        await ensure_feature(db, ctx.tenant_id, feature)
        return ctx
    return dep


# ---- platform settings ----------------------------------------------------------------------------------------------

async def get_setting(db: AsyncSession, key: str, default):
    row = (await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))).scalar_one_or_none()
    return row.value.get("v", default) if row and isinstance(row.value, dict) else default


async def set_setting(db: AsyncSession, key: str, value) -> None:
    row = await db.get(PlatformSetting, key)
    if row is None:
        db.add(PlatformSetting(key=key, value={"v": value}))
    else:
        row.value = {"v": value}
    await db.commit()


async def trial_days(db: AsyncSession) -> int:
    try:
        return max(1, min(int(await get_setting(db, TRIAL_DAYS_KEY, TRIAL_DAYS_DEFAULT)), 365))
    except (TypeError, ValueError):
        return TRIAL_DAYS_DEFAULT
