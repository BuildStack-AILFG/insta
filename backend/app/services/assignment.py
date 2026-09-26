"""Auto-assignment of new conversations to team members (Settings -> Assignment rules)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversation import Conversation
from app.models.tenant import Tenant, TenantMembership, User

MODES = {"none", "round_robin", "least_busy"}
ELIGIBLE_ROLES = ("owner", "admin", "agent")


def get_rules(tenant: Tenant) -> dict:
    rules = (tenant.settings or {}).get("assignment") or {}
    return {"mode": rules.get("mode", "none") if rules.get("mode") in MODES else "none", "cursor": int(rules.get("cursor", 0)), "exclude": list(rules.get("exclude", []))}


async def eligible_agents(db: AsyncSession, tenant_id: uuid.UUID, exclude: list[str]) -> list[uuid.UUID]:
    rows = await db.execute(
        select(TenantMembership.user_id)
        .join(User, User.id == TenantMembership.user_id)
        .where(TenantMembership.tenant_id == tenant_id, TenantMembership.role.in_(ELIGIBLE_ROLES), User.is_active.is_(True))
        .order_by(TenantMembership.created_at, TenantMembership.user_id)
    )
    return [r[0] for r in rows if str(r[0]) not in exclude]


async def assign_new(db: AsyncSession, tenant: Tenant, conv: Conversation) -> uuid.UUID | None:
    """Pick an assignee for a fresh conversation according to workspace rules. Mutates conv (and tenant.settings for the cursor)."""
    rules = get_rules(tenant)
    if rules["mode"] == "none" or conv.assigned_user_id:
        return None
    agents = await eligible_agents(db, tenant.id, rules["exclude"])
    if not agents:
        return None

    if rules["mode"] == "round_robin":
        chosen = agents[rules["cursor"] % len(agents)]
        tenant.settings = {**tenant.settings, "assignment": {**(tenant.settings.get("assignment") or {}), "cursor": (rules["cursor"] + 1) % len(agents)}}
    else:  # least_busy
        counts = dict((await db.execute(
            select(Conversation.assigned_user_id, func.count()).where(
                Conversation.tenant_id == tenant.id, Conversation.status == "open", Conversation.assigned_user_id.in_(agents)
            ).group_by(Conversation.assigned_user_id)
        )).all())
        chosen = min(agents, key=lambda a: (counts.get(a, 0), str(a)))
    conv.assigned_user_id = chosen
    return chosen
