"""Outbound messaging: the one place that talks to Instagram for DMs and keeps messages/conversations consistent."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact
from app.models.conversation import Conversation, Message
from app.models.instagram_account import InstagramAccount
from app.services import outbound_webhooks
from app.services.instagram.accounts import client_for
from app.services.instagram.graph import GraphError

log = logging.getLogger(__name__)

# Standard messaging window after the person's last message.
WINDOW = timedelta(hours=24)
# A human agent may still answer for 7 days using the HUMAN_AGENT tag (needs the Human Agent permission on the Meta app).
HUMAN_AGENT_WINDOW = timedelta(days=7)
MAX_TEXT = 1000
MAX_QUICK_REPLIES = 13
MAX_BUTTONS = 3


class SendBlocked(Exception):
    """A send was refused locally (outside the messaging window, opted-out, disconnected) before ever calling Instagram."""

    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.message = message
        self.code = code


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def window_open(conv: Conversation, now: datetime | None = None) -> bool:
    now = now or utcnow()
    return bool(conv.last_inbound_at and now - conv.last_inbound_at < WINDOW)


def window_expires_at(conv: Conversation) -> datetime | None:
    return conv.last_inbound_at + WINDOW if conv.last_inbound_at else None


def human_agent_allowed(account: InstagramAccount, conv: Conversation, now: datetime | None = None) -> bool:
    now = now or utcnow()
    return bool((account.settings or {}).get("human_agent_tag") and conv.last_inbound_at and now - conv.last_inbound_at < HUMAN_AGENT_WINDOW)


def preview_for(msg_type: str, body: str | None) -> str:
    if body:
        return body[:280]
    return {"image": "📷 Photo", "video": "🎥 Video", "audio": "🎵 Audio", "file": "📄 File", "story_mention": "Mentioned you in their story",
            "story_reply": "Replied to your story", "share": "Shared a post", "reel": "Shared a reel", "buttons": "Message with buttons",
            "reaction": "Reacted to a message"}.get(msg_type, msg_type.replace("_", " ").title())


def display_name(username: str | None, name: str | None, igsid: str) -> str:
    return name or (f"@{username}" if username else f"Instagram user {igsid[-6:]}")


# ---- contacts & conversations ------------------------------------------------------------------------------------

async def upsert_contact(db: AsyncSession, tenant_id: uuid.UUID, igsid: str, *, username: str | None = None, name: str | None = None,
                         source: str = "instagram") -> tuple[Contact, bool]:
    """Race-safe get-or-create by (tenant, Instagram user id). Returns (contact, created)."""
    stmt = (
        pg_insert(Contact)
        .values(id=uuid.uuid4(), tenant_id=tenant_id, ig_user_id=igsid, ig_username=username, name=display_name(username, name, igsid), source=source,
                tags=[], custom_fields={}, ad_attribution={}, opted_out=False)
        .on_conflict_do_nothing(constraint="uq_contacts_tenant_ig_user")
        .returning(Contact.id)
    )
    inserted = (await db.execute(stmt)).scalar_one_or_none()
    contact = (await db.execute(select(Contact).where(Contact.tenant_id == tenant_id, Contact.ig_user_id == igsid))).scalar_one()
    if inserted is None:
        if username and contact.ig_username != username:
            contact.ig_username = username
        if (name or username) and contact.name.startswith("Instagram user "):
            contact.name = display_name(username, name, igsid)  # replace the placeholder once we learn who this is
    return contact, inserted is not None


async def upsert_contact_by_phone(db: AsyncSession, tenant_id: uuid.UUID, phone: str, *, name: str | None = None, source: str = "manual",
                                  email: str | None = None) -> tuple[Contact, bool]:
    """Contacts that arrive from outside Instagram (API, integrations, CSV) are keyed by phone until they DM the account."""
    stmt = (
        pg_insert(Contact)
        .values(id=uuid.uuid4(), tenant_id=tenant_id, phone=phone, name=name or f"+{phone}", email=email, source=source, tags=[], custom_fields={},
                ad_attribution={}, opted_out=False)
        .on_conflict_do_nothing(constraint="uq_contacts_tenant_phone")
        .returning(Contact.id)
    )
    inserted = (await db.execute(stmt)).scalar_one_or_none()
    contact = (await db.execute(select(Contact).where(Contact.tenant_id == tenant_id, Contact.phone == phone))).scalar_one()
    if inserted is None and name and (contact.name.startswith("+") or contact.name == contact.phone):
        contact.name = name
    return contact, inserted is not None


async def get_or_create_conversation(db: AsyncSession, account: InstagramAccount, contact: Contact) -> tuple[Conversation, bool]:
    stmt = (
        pg_insert(Conversation)
        .values(id=uuid.uuid4(), tenant_id=account.tenant_id, account_id=account.id, contact_id=contact.id, status="open", inbox_status="bot", labels=[], unread_count=0)
        .on_conflict_do_nothing(constraint="uq_conversations_account_contact")
        .returning(Conversation.id)
    )
    inserted = (await db.execute(stmt)).scalar_one_or_none()
    conv = (await db.execute(select(Conversation).where(Conversation.account_id == account.id, Conversation.contact_id == contact.id))).scalar_one()
    return conv, inserted is not None


# ---- message builders ---------------------------------------------------------------------------------------------

def link_buttons(buttons: list[dict]) -> list[dict]:
    """[{title, url} | {title, payload}] -> Instagram button-template buttons (max 3, titles <= 20 chars)."""
    out = []
    for b in buttons[:MAX_BUTTONS]:
        title = str(b.get("title") or "").strip()[:20]
        if not title:
            continue
        if b.get("url"):
            out.append({"type": "web_url", "url": str(b["url"]), "title": title})
        else:
            out.append({"type": "postback", "payload": str(b.get("payload") or b.get("id") or title)[:1000], "title": title})
    return out


def quick_replies(options: list[dict]) -> list[dict]:
    """[{title, payload?}] -> Instagram quick replies (max 13, titles <= 20 chars)."""
    return [{"content_type": "text", "title": str(o.get("title"))[:20], "payload": str(o.get("payload") or o.get("id") or o.get("title"))[:1000]}
            for o in options[:MAX_QUICK_REPLIES] if str(o.get("title") or "").strip()]


# ---- outbound -----------------------------------------------------------------------------------------------------

async def send_message(
    db: AsyncSession,
    account: InstagramAccount,
    conversation: Conversation,
    contact: Contact,
    *,
    kind: str,                          # text|image|video|audio|file|buttons
    text: str | None = None,
    media_url: str | None = None,
    media_filename: str | None = None,
    media_mime: str | None = None,
    buttons: list[dict] | None = None,  # for kind=buttons: [{title, url} | {title, payload}]
    options: list[dict] | None = None,  # quick replies under a text: [{title, payload}]
    sender_type: str = "agent",
    sender_user_id: uuid.UUID | None = None,
    callback_data: str | None = None,
    extra_payload: dict | None = None,
    strict: bool = True,
) -> Message:
    """Send one DM and persist it. `strict=True` re-raises Instagram errors after recording the failed message."""
    if account.status == "disconnected":
        raise SendBlocked("This Instagram account is disconnected.", "account_disconnected")
    if not contact.ig_user_id:
        raise SendBlocked("This contact hasn't messaged your Instagram account yet, so they can't be DMed.", "no_instagram_id")
    if contact.opted_out and sender_type == "flow":
        raise SendBlocked("This contact has opted out of automated messages.", "opted_out")
    tag = None
    if not window_open(conversation):
        if sender_type == "agent" and human_agent_allowed(account, conversation):
            tag = "HUMAN_AGENT"
        else:
            raise SendBlocked("Instagram only allows replies within 24 hours of the person's last message. Wait for them to message again.", "outside_window")

    body = (text or "")[:MAX_TEXT] if text else text
    payload: dict[str, Any] = {k: v for k, v in {"buttons": buttons, "options": options, "url": media_url, "tag": tag}.items() if v}
    msg = Message(
        tenant_id=account.tenant_id, conversation_id=conversation.id, direction="out", type=kind, body=body, status="queued",
        media_url=media_url, media_mime=media_mime, media_filename=media_filename, payload={**payload, **(extra_payload or {})},
        sender_type=sender_type, sender_user_id=sender_user_id, callback_data=callback_data,
    )
    db.add(msg)
    await db.flush()

    client = client_for(account)
    error: GraphError | None = None
    try:
        if kind == "text":
            mid = await client.send_text(contact.ig_user_id, body or "", quick_replies=quick_replies(options or []) or None, tag=tag)
        elif kind in {"image", "video", "audio", "file"}:
            if not media_url:
                raise ValueError("media_url is required for attachments")
            mid = await client.send_attachment(contact.ig_user_id, kind, media_url, tag=tag)
        elif kind == "buttons":
            mid = await client.send_buttons(contact.ig_user_id, body or "", link_buttons(buttons or []), tag=tag)
        else:
            raise ValueError(f"Unsupported message kind: {kind}")
        msg.external_id, msg.status, msg.sent_at = mid or None, "sent", utcnow()
    except GraphError as exc:
        error = exc
        msg.status, msg.error = "failed", str(exc)[:1000]
        if exc.is_auth_error:
            account.status, account.last_error = "error", str(exc)[:500]
        log.warning("send failed tenant=%s to=%s code=%s: %s", account.tenant_id, contact.ig_user_id, exc.code, exc)

    now = utcnow()
    conversation.last_message_at = now
    conversation.last_message_preview = preview_for(kind, body)
    contact.last_contacted_at = now
    await db.commit()

    if error is None:
        await outbound_webhooks.emit(account.tenant_id, "message_sent", {"message_id": str(msg.id), "to": contact.ig_username or contact.ig_user_id, "type": kind})
    else:
        await outbound_webhooks.emit(account.tenant_id, "message_failed", {"message_id": str(msg.id), "to": contact.ig_username or contact.ig_user_id, "error": msg.error})
        if strict:
            raise error
    return msg


async def record_outbound(db: AsyncSession, account: InstagramAccount, conversation: Conversation, *, kind: str, body: str | None, external_id: str | None,
                          sender_type: str, payload: dict | None = None, error: str | None = None) -> Message:
    """Persist a DM that was sent by another path (a private reply to a comment) so it shows in the inbox."""
    now = utcnow()
    msg = Message(tenant_id=account.tenant_id, conversation_id=conversation.id, direction="out", type=kind, body=body, external_id=external_id,
                  status="failed" if error else "sent", error=error, sender_type=sender_type, payload=payload or {}, sent_at=None if error else now)
    db.add(msg)
    conversation.last_message_at = now
    conversation.last_message_preview = preview_for(kind, body)
    await db.flush()
    return msg
