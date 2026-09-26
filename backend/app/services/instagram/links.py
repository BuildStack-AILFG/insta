"""
Click tracking for links sent in DMs. Each button URL is swapped for {PUBLIC_BASE_URL}/api/l/{code}; opening it counts the
click and redirects to the real URL. One code per (link, person), so we know exactly who clicked.
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.comment_automation import CommentAutomation
from app.models.contact import Contact
from app.models.tracked_link import TrackedLink
from app.services import outbound_webhooks

log = logging.getLogger(__name__)


def tracking_enabled() -> bool:
    """Instagram opens button links on the person's phone, so the redirect must be publicly reachable."""
    return bool(get_settings().public_base_url)


def _redirect_url(code: str) -> str:
    return f"{get_settings().public_base_url.rstrip('/')}/api/l/{code}"


async def track_buttons(db: AsyncSession, tenant_id: uuid.UUID, buttons: list[dict], *, source: str, contact_id: uuid.UUID | None = None,
                        automation_id: uuid.UUID | None = None, flow_id: uuid.UUID | None = None, variant: str | None = None) -> list[dict]:
    """Return a copy of [{title, url}] buttons with each url replaced by a tracked redirect (unchanged when tracking is off)."""
    if not tracking_enabled():
        return [dict(b) for b in buttons]
    out = []
    for b in buttons:
        url = str(b.get("url") or "")
        if not url.startswith(("http://", "https://")):
            out.append(dict(b))
            continue
        code = secrets.token_urlsafe(9)
        db.add(TrackedLink(tenant_id=tenant_id, code=code, url=url, source=source, automation_id=automation_id, flow_id=flow_id,
                           contact_id=contact_id, label=str(b.get("title") or "")[:100], variant=variant))
        out.append({**b, "url": _redirect_url(code), "target_url": url})
    await db.flush()
    return out


async def record_click(db: AsyncSession, link: TrackedLink) -> None:
    """Count a click. The first click by a person also counts toward the automation, tags the contact and fires a webhook."""
    now = datetime.now(timezone.utc)
    first = link.clicks == 0
    link.clicks = (link.clicks or 0) + 1
    link.last_clicked_at = now
    if first:
        link.first_clicked_at = now
    contact = await db.get(Contact, link.contact_id) if link.contact_id else None
    automation = await db.get(CommentAutomation, link.automation_id) if link.automation_id else None
    if first and automation is not None:
        await db.execute(update(CommentAutomation).where(CommentAutomation.id == automation.id).values(link_clicks=CommentAutomation.link_clicks + 1))
    if first and contact is not None:
        tag = f"clicked:{(automation.name if automation else link.label or 'link')[:40]}"
        contact.tags = sorted({*(contact.tags or []), tag})
    await db.commit()
    if first:
        await outbound_webhooks.emit(link.tenant_id, "link_clicked", {
            "url": link.url, "label": link.label, "source": link.source, "automation_id": str(link.automation_id) if link.automation_id else None,
            "contact_id": str(link.contact_id) if link.contact_id else None, "username": contact.ig_username if contact else None,
        })
