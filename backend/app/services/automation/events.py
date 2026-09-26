"""Behavioural events (from the API, integrations or the dashboard): record them, then let matching flows react."""

from __future__ import annotations

import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation_flow import AutomationFlow
from app.models.contact import Contact
from app.models.contact_event import ContactEvent
from app.models.instagram_account import InstagramAccount
from app.services.automation import flow_engine
from app.services.instagram import messaging

log = logging.getLogger(__name__)


async def record_event(db: AsyncSession, tenant_id: uuid.UUID, contact: Contact, name: str, properties: dict, source: str) -> ContactEvent:
    ev = ContactEvent(tenant_id=tenant_id, contact_id=contact.id, name=name[:100], properties=properties or {}, source=source)
    db.add(ev)
    await db.flush()
    return ev


async def trigger_flows(db: AsyncSession, tenant_id: uuid.UUID, contact: Contact, name: str, properties: dict) -> int:
    """Start published flows whose Start node listens for this event name."""
    flows = (await db.execute(select(AutomationFlow).where(AutomationFlow.tenant_id == tenant_id, AutomationFlow.status == "published", AutomationFlow.trigger_type == "event"))).scalars().all()
    started = 0
    account = (await db.execute(select(InstagramAccount).where(InstagramAccount.tenant_id == tenant_id, InstagramAccount.status == "connected").limit(1))).scalar_one_or_none()
    for f in flows:
        start = next((n for n in (f.published_snapshot or {}).get("nodes", []) if n.get("type") == "start"), None)
        if ((start or {}).get("data") or {}).get("event") != name:
            continue
        # Only people who have DMed/commented have an Instagram id; others still run the flow's non-messaging steps (tags, deals, webhooks).
        conv = (await messaging.get_or_create_conversation(db, account, contact))[0] if account and contact.ig_user_id else None
        if await flow_engine.start_flow(db, f, contact, conv, context={k: v for k, v in (properties or {}).items() if isinstance(v, (str, int, float, bool))}) is not None:
            started += 1
    return started


async def process(db: AsyncSession, tenant_id: uuid.UUID, contact: Contact, name: str, properties: dict, source: str) -> dict[str, Any]:
    await record_event(db, tenant_id, contact, name, properties, source)
    flows = await trigger_flows(db, tenant_id, contact, name, properties)
    result: dict[str, Any] = {"event": name, "flows_started": flows}
    await db.commit()
    return result
