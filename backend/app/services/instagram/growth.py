"""
Growth tools:
  * ig.me ref links — https://ig.me/m/{username}?ref={ref}. Opening one starts a DM thread; Instagram sends a
    messaging_referral webhook (which also opens the 24h reply window), and we send that link's welcome.
  * Click reminders — a gentle nudge for people who got a comment-automation link but didn't open it, sent only while
    Instagram's 24h window is open.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import session as db_session
from app.models.automation_flow import AutomationFlow
from app.models.comment_automation import CommentAutomation
from app.models.contact import Contact
from app.models.contact_event import ContactEvent
from app.models.conversation import Conversation, Message
from app.models.growth import RefLink
from app.models.instagram_account import InstagramAccount
from app.models.tracked_link import TrackedLink
from app.services import templating
from app.services.automation import flow_engine
from app.services.instagram import links, messaging

log = logging.getLogger(__name__)

REF_COOLDOWN = timedelta(hours=24)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ref_url(username: str, ref: str) -> str:
    return f"https://ig.me/m/{username}?ref={ref}"


async def run_ref(account_id: uuid.UUID, ref: str, conversation_id: uuid.UUID) -> None:
    """Background entry point for a messaging_referral — owns its own session and never raises."""
    try:
        async with db_session.async_session_factory() as db:
            link = (await db.execute(select(RefLink).where(RefLink.account_id == account_id, RefLink.ref == ref[:60]))).scalar_one_or_none()
            conv = await db.get(Conversation, conversation_id)
            account = await db.get(InstagramAccount, account_id)
            if link is None or conv is None or account is None or not link.enabled:
                return
            contact = await db.get(Contact, conv.contact_id)
            await handle_ref(db, account, link, conv, contact)
    except Exception:  # noqa: BLE001
        log.exception("ref link %s failed", ref)


async def handle_ref(db: AsyncSession, account: InstagramAccount, link: RefLink, conv: Conversation, contact: Contact) -> str:
    tag = f"ref:{link.ref}"
    first_time = tag not in (contact.tags or [])
    await db.execute(update(RefLink).where(RefLink.id == link.id).values(
        opens=RefLink.opens + 1, people=RefLink.people + int(first_time), last_opened_at=utcnow()))
    contact.tags = sorted({*(contact.tags or []), tag, *([link.tag.strip()] if link.tag.strip() else [])})
    db.add(ContactEvent(tenant_id=contact.tenant_id, contact_id=contact.id, name="ref_link_opened", properties={"ref": link.ref, "name": link.name}, source="instagram"))
    await db.commit()

    recent = (await db.execute(select(Message.id).where(
        Message.conversation_id == conv.id, Message.direction == "out", Message.payload["ref_link_id"].as_string() == str(link.id),
        Message.created_at > utcnow() - REF_COOLDOWN).limit(1))).first()
    if recent:
        return "cooldown"  # someone tapping the same link twice doesn't get the same welcome twice
    if link.message.strip():
        buttons = [b for b in link.buttons or [] if b.get("title") and b.get("url")]
        if buttons:
            buttons = await links.track_buttons(db, contact.tenant_id, buttons, source="ref_link", contact_id=contact.id)
        try:
            await messaging.send_message(db, account, conv, contact, kind="buttons" if buttons else "text", text=templating.render(link.message, contact),
                                         buttons=buttons or None, sender_type="bot", extra_payload={"auto": "ref_link", "ref_link_id": str(link.id)}, strict=False)
        except messaging.SendBlocked as exc:
            log.info("ref link welcome blocked: %s", exc.message)
    if link.flow_id:
        flow = await db.get(AutomationFlow, link.flow_id)
        if flow is not None and flow.status == "published" and flow.tenant_id == contact.tenant_id:
            await flow_engine.start_flow(db, flow, contact, conv, context={"ref": link.ref})
            await db.commit()
    return "sent"


# ---- click reminders ---------------------------------------------------------------------------------------------

async def run_reminders(limit: int = 50) -> int:
    """Scheduler job: remind people who haven't opened a comment-automation link, while their 24h window is open."""
    sent = 0
    now = utcnow()
    async with db_session.async_session_factory() as db:
        automations = (await db.execute(select(CommentAutomation).where(CommentAutomation.reminder_enabled.is_(True), CommentAutomation.status == "active"))).scalars().all()
        for a in automations:
            due_before = now - timedelta(minutes=max(5, a.reminder_after_minutes or 120))
            rows = (await db.execute(select(TrackedLink.contact_id).where(
                TrackedLink.automation_id == a.id, TrackedLink.contact_id.is_not(None), TrackedLink.created_at <= due_before,
                TrackedLink.created_at > now - timedelta(hours=24), TrackedLink.reminded_at.is_(None),
            ).group_by(TrackedLink.contact_id).limit(limit))).all()
            for (contact_id,) in rows:
                clicked = (await db.execute(select(TrackedLink.id).where(TrackedLink.automation_id == a.id, TrackedLink.contact_id == contact_id,
                                                                          TrackedLink.clicks > 0).limit(1))).first()
                await db.execute(update(TrackedLink).where(TrackedLink.automation_id == a.id, TrackedLink.contact_id == contact_id).values(reminded_at=now))
                await db.commit()
                if clicked:
                    continue
                sent += await _remind(db, a, contact_id)
    return sent


async def _remind(db: AsyncSession, a: CommentAutomation, contact_id: uuid.UUID) -> int:
    contact = await db.get(Contact, contact_id)
    conv = (await db.execute(select(Conversation).where(Conversation.account_id == a.account_id, Conversation.contact_id == contact_id))).scalar_one_or_none()
    account = await db.get(InstagramAccount, a.account_id)
    if contact is None or conv is None or account is None or not messaging.window_open(conv):
        return 0  # a private reply alone doesn't open the window — only people who replied can be reminded
    from app.services.instagram.comments import _dm_buttons, variant_for  # local: comments imports growth-free modules only
    buttons = await _dm_buttons(db, a, contact, variant_for(a, contact))
    text = templating.render(a.reminder_text or "Just checking you saw this 👇", contact)
    try:
        msg = await messaging.send_message(db, account, conv, contact, kind="buttons" if buttons else "text", text=text, buttons=buttons or None,
                                           sender_type="comment", extra_payload={"auto": "click_reminder", "automation_id": str(a.id)}, strict=False)
    except messaging.SendBlocked:
        return 0
    if msg.status == "failed":
        return 0
    # The fresh links in the reminder shouldn't trigger another reminder.
    await db.execute(update(TrackedLink).where(TrackedLink.automation_id == a.id, TrackedLink.contact_id == contact.id, TrackedLink.reminded_at.is_(None))
                     .values(reminded_at=utcnow()))
    await db.execute(update(CommentAutomation).where(CommentAutomation.id == a.id).values(reminders_sent=CommentAutomation.reminders_sent + 1))
    await db.commit()
    return 1
