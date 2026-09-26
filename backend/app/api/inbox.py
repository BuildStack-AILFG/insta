"""Shared team inbox for Instagram DMs: conversations, messages (send / notes / media links), assignment and status."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.models.contact import Contact
from app.models.contact_event import ContactEvent
from app.models.conversation import Conversation, Message
from app.models.instagram_account import InstagramAccount
from app.models.tenant import TenantMembership, User
from app.services.instagram import messaging
from app.services.instagram.accounts import client_for
from app.services.instagram.graph import GraphError

router = APIRouter(prefix="/inbox", tags=["inbox"])

def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


async def _conv(db: AsyncSession, ctx: Ctx, conv_id: uuid.UUID) -> Conversation:
    conv = await db.get(Conversation, conv_id)
    if conv is None or conv.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Conversation not found."})
    return conv


def _conv_out(c: Conversation, contact: Contact, assignee: User | None) -> dict:
    return {
        "id": str(c.id), "status": c.status, "inbox_status": c.inbox_status, "labels": c.labels or [], "unread_count": c.unread_count,
        "last_message_at": _iso(c.last_message_at), "last_message_preview": c.last_message_preview,
        "window_open": messaging.window_open(c), "window_expires_at": _iso(messaging.window_expires_at(c)),
        "human_agent_until": _iso(c.last_inbound_at + messaging.HUMAN_AGENT_WINDOW) if c.last_inbound_at else None,
        "assigned_user": {"id": str(assignee.id), "name": assignee.full_name or assignee.email} if assignee else None,
        "contact": {"id": str(contact.id), "name": contact.name, "username": contact.ig_username, "profile_pic_url": contact.profile_pic_url,
                    "phone": contact.phone, "opted_out": contact.opted_out, "is_follower": contact.is_follower},
        "account_id": str(c.account_id),
    }


@router.get("/conversations")
async def list_conversations(
    status_: Literal["open", "resolved", "all"] = Query("open", alias="status"),
    assigned: str | None = Query(None, description="me | unassigned | <user uuid>"),
    unread: bool = False, q: str | None = None, label: str | None = None, mode: Literal["bot", "intervened"] | None = None,
    limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0),
    ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db),
) -> dict:
    cond = [Conversation.tenant_id == ctx.tenant_id]
    if status_ != "all":
        cond.append(Conversation.status == status_)
    if assigned == "me":
        cond.append(Conversation.assigned_user_id == ctx.user_id)
    elif assigned == "unassigned":
        cond.append(Conversation.assigned_user_id.is_(None))
    elif assigned:
        try:
            cond.append(Conversation.assigned_user_id == uuid.UUID(assigned))
        except ValueError:
            raise HTTPException(status_code=422, detail={"error": "Invalid assignee."})
    if unread:
        cond.append(Conversation.unread_count > 0)
    if label:
        cond.append(Conversation.labels.any(label))
    if mode:
        cond.append(Conversation.inbox_status == mode)
    base = select(Conversation, Contact).join(Contact, Contact.id == Conversation.contact_id).where(*cond)
    if q and q.strip():
        like = f"%{q.strip()}%"
        base = base.where(or_(Contact.name.ilike(like), Contact.ig_username.ilike(like.replace("@", "")), Contact.phone.ilike(like.replace("+", ""))))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.order_by(Conversation.last_message_at.desc().nullslast()).limit(limit).offset(offset))).all()
    ids = {c.assigned_user_id for c, _ in rows if c.assigned_user_id}
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(ids)))).scalars()} if ids else {}
    return {"total": total, "items": [_conv_out(c, contact, users.get(c.assigned_user_id)) for c, contact in rows]}


@router.get("/summary")
async def summary(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    c = Conversation
    row = (await db.execute(select(
        func.count().filter(c.status == "open"), func.count().filter((c.status == "open") & (c.unread_count > 0)),
        func.count().filter((c.status == "open") & c.assigned_user_id.is_(None)), func.count().filter((c.status == "open") & (c.assigned_user_id == ctx.user_id)),
        func.count().filter(c.status == "resolved"), func.coalesce(func.sum(c.unread_count).filter(c.status == "open"), 0),
    ).where(c.tenant_id == ctx.tenant_id))).one()
    labels = (await db.execute(select(func.unnest(c.labels)).where(c.tenant_id == ctx.tenant_id).distinct())).scalars().all()
    return {"open": row[0], "unread_conversations": row[1], "unassigned": row[2], "mine": row[3], "resolved": row[4], "unread_messages": int(row[5]), "labels": sorted(labels)}


class StartConversation(BaseModel):
    contact_id: uuid.UUID
    account_id: uuid.UUID | None = None


@router.post("/conversations", status_code=201)
async def start_conversation(body: StartConversation, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    contact = await db.get(Contact, body.contact_id)
    if contact is None or contact.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Contact not found."})
    if not contact.ig_user_id:
        raise HTTPException(status_code=409, detail={"error": "Instagram only lets you message people who have messaged or commented first.", "code": "no_instagram_id"})
    q = select(InstagramAccount).where(InstagramAccount.tenant_id == ctx.tenant_id, InstagramAccount.status == "connected")
    if body.account_id:
        q = q.where(InstagramAccount.id == body.account_id)
    account = (await db.execute(q.limit(1))).scalar_one_or_none()
    if account is None:
        raise HTTPException(status_code=409, detail={"error": "Connect an Instagram account first.", "code": "no_account"})
    conv, _ = await messaging.get_or_create_conversation(db, account, contact)
    await db.commit()
    assignee = await db.get(User, conv.assigned_user_id) if conv.assigned_user_id else None
    return _conv_out(conv, contact, assignee)


@router.get("/conversations/{conv_id}")
async def get_conversation(conv_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    conv = await _conv(db, ctx, conv_id)
    contact = await db.get(Contact, conv.contact_id)
    assignee = await db.get(User, conv.assigned_user_id) if conv.assigned_user_id else None
    events = (await db.execute(select(ContactEvent).where(ContactEvent.contact_id == contact.id).order_by(ContactEvent.created_at.desc()).limit(15))).scalars().all()
    out = _conv_out(conv, contact, assignee)
    out["contact"].update({"email": contact.email, "tags": contact.tags, "traits": contact.custom_fields, "source": contact.source, "ad_attribution": contact.ad_attribution,
                           "follower_count": contact.follower_count, "created_at": _iso(contact.created_at)})
    out["events"] = [{"name": e.name, "properties": e.properties, "at": _iso(e.created_at)} for e in events]
    return out


def _msg_out(m: Message) -> dict:
    return {
        "id": str(m.id), "direction": m.direction, "type": m.type, "body": m.body, "status": m.status, "error": m.error, "sender_type": m.sender_type,
        "sender_user_id": str(m.sender_user_id) if m.sender_user_id else None, "is_internal": m.is_internal, "has_media": bool(m.media_url),
        "media_url": m.media_url, "media_mime": m.media_mime, "media_filename": m.media_filename, "payload": m.payload or {},
        "created_at": _iso(m.created_at), "sent_at": _iso(m.sent_at), "delivered_at": _iso(m.delivered_at), "read_at": _iso(m.read_at),
    }


@router.get("/conversations/{conv_id}/messages")
async def list_messages(conv_id: uuid.UUID, limit: int = Query(80, ge=1, le=200), before: datetime | None = None,
                        ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    """Newest `limit` messages (ascending). Poll this every few seconds; pass `before` to page back through history."""
    conv = await _conv(db, ctx, conv_id)
    q = select(Message).where(Message.conversation_id == conv.id)
    if before:
        q = q.where(Message.created_at < before)
    rows = list((await db.execute(q.order_by(Message.created_at.desc()).limit(limit + 1))).scalars())
    has_more = len(rows) > limit
    return {"items": [_msg_out(m) for m in reversed(rows[:limit])], "has_more": has_more, "window_open": messaging.window_open(conv), "window_expires_at": _iso(messaging.window_expires_at(conv))}


URL_PATTERN = r"^https?://[^\s]+$"


class LinkButton(BaseModel):
    title: str = Field(min_length=1, max_length=20)
    url: str = Field(pattern=URL_PATTERN, max_length=2000)


class SendBody(BaseModel):
    type: Literal["text", "image", "video", "audio", "file", "buttons", "note"] = "text"
    text: str | None = Field(default=None, max_length=messaging.MAX_TEXT)
    media_url: str | None = Field(default=None, pattern=URL_PATTERN, max_length=2000)  # attachments must be at a public url
    buttons: list[LinkButton] = Field(default_factory=list, max_length=3)
    keep_bot: bool = False  # by default an agent reply pauses automation for this conversation


@router.post("/conversations/{conv_id}/messages", status_code=201)
async def send(conv_id: uuid.UUID, body: SendBody, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    conv = await _conv(db, ctx, conv_id)
    contact = await db.get(Contact, conv.contact_id)
    account = await db.get(InstagramAccount, conv.account_id)
    now = datetime.now(timezone.utc)

    if body.type == "note":
        if not (body.text or "").strip():
            raise HTTPException(status_code=422, detail={"error": "Note is empty."})
        note = Message(tenant_id=ctx.tenant_id, conversation_id=conv.id, direction="out", type="text", body=body.text, status="sent", sender_type="agent",
                       sender_user_id=ctx.user_id, is_internal=True)
        db.add(note)
        await db.commit()
        return _msg_out(note)

    kwargs: dict = {"kind": body.type}
    if body.type in {"text", "buttons"}:
        if not (body.text or "").strip():
            raise HTTPException(status_code=422, detail={"error": "Message is empty."})
        kwargs["text"] = body.text
        if body.type == "buttons":
            if not body.buttons:
                raise HTTPException(status_code=422, detail={"error": "Add at least one link button."})
            kwargs["buttons"] = [{"title": b.title, "url": b.url} for b in body.buttons]
    else:  # attachment
        if not body.media_url:
            raise HTTPException(status_code=422, detail={"error": "Paste a public link to the file."})
        kwargs["media_url"] = body.media_url

    try:
        msg = await messaging.send_message(db, account, conv, contact, sender_type="agent", sender_user_id=ctx.user_id, **kwargs)
    except messaging.SendBlocked as exc:
        raise HTTPException(status_code=409, detail={"error": exc.message, "code": exc.code})
    except GraphError as exc:
        raise HTTPException(status_code=502, detail={"error": f"Instagram could not send this message: {exc}", "code": exc.code})

    # A human replied: they own the conversation now.
    if not body.keep_bot:
        conv.inbox_status = "intervened"
    if conv.assigned_user_id is None:
        conv.assigned_user_id = ctx.user_id
    conv.unread_count, conv.last_message_at = 0, now
    await db.commit()
    return _msg_out(msg)


@router.post("/conversations/{conv_id}/read")
async def mark_read(conv_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    conv = await _conv(db, ctx, conv_id)
    conv.unread_count = 0
    await db.commit()
    if ctx.role != "viewer" and messaging.window_open(conv):  # "Seen" for the customer — best effort, never blocks the UI
        account = await db.get(InstagramAccount, conv.account_id)
        contact = await db.get(Contact, conv.contact_id)
        if account is not None and account.status == "connected" and contact is not None and contact.ig_user_id:
            try:
                await client_for(account).mark_seen(contact.ig_user_id)
            except GraphError:
                pass
    return {"ok": True}


class ConvPatch(BaseModel):
    status: Literal["open", "resolved"] | None = None
    assigned_user_id: uuid.UUID | Literal["none"] | None = None
    labels: list[str] | None = Field(default=None, max_length=20)
    inbox_status: Literal["bot", "intervened"] | None = None


@router.patch("/conversations/{conv_id}")
async def patch_conversation(conv_id: uuid.UUID, body: ConvPatch, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    conv = await _conv(db, ctx, conv_id)
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"]:
        conv.status = data["status"]
    if "inbox_status" in data and data["inbox_status"]:
        conv.inbox_status = data["inbox_status"]
    if "labels" in data and data["labels"] is not None:
        conv.labels = sorted({l.strip()[:40] for l in data["labels"] if l.strip()})
    if "assigned_user_id" in data:
        target = data["assigned_user_id"]
        if target in (None, "none"):
            conv.assigned_user_id = None
        else:
            ok = (await db.execute(select(TenantMembership.id).where(TenantMembership.tenant_id == ctx.tenant_id, TenantMembership.user_id == target))).first()
            if not ok:
                raise HTTPException(status_code=422, detail={"error": "That person isn't in this workspace."})
            conv.assigned_user_id = target
    await db.commit()
    contact = await db.get(Contact, conv.contact_id)
    assignee = await db.get(User, conv.assigned_user_id) if conv.assigned_user_id else None
    return _conv_out(conv, contact, assignee)
