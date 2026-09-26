"""Plan quota lookup and enforcement. A missing/negative quota means unlimited."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.plan import Plan
from app.models.tenant import Tenant


async def quotas_for(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    tenant = await db.get(Tenant, tenant_id)
    if tenant is None:
        return {}
    plan = await db.get(Plan, tenant.plan_id)
    return {**((plan.quotas if plan else None) or {}), **(tenant.quotas_override or {})}


async def enforce(db: AsyncSession, tenant_id: uuid.UUID, key: str, current: int, adding: int = 1, label: str | None = None) -> None:
    """Raise 402 if adding `adding` to `current` would exceed the plan's `key` quota."""
    limit = (await quotas_for(db, tenant_id)).get(key)
    if limit is None or limit < 0:
        return
    if current + adding > limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={"error": f"Your plan allows {limit} {label or key.replace('max_', '').replace('_', ' ')}. Upgrade your plan to add more.", "quota": key},
        )
