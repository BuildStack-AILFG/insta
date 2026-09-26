"""
Inbound Instagram webhook processing: verify -> dedupe -> persist. Automation runs afterwards in background tasks
(DMs: automation/dispatcher.py, comments: instagram/comments.py).

Payload shape (object = "instagram"):
  entry[].id                      the professional account's IG user id
  entry[].messaging[]             DMs, echoes, postbacks, reactions, seen receipts, referrals
  entry[].changes[] (field=...)   comments, live_comments, mentions
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.conversation import Message
from app.models.growth import RefLink
from app.models.instagram_account import InstagramAccount
from app.models.tenant import Tenant
from app.models.webhook import WebhookIngress
from app.services import assignment, outbound_webhooks, pipeline
from app.services.instagram import comments, messaging
from app.services.instagram.accounts import client_for
from app.services.instagram.graph import GraphError

log = logging.getLogger(__name__)

OPT_OUT_WORDS = {"stop", "unsubscribe", "stop all", "opt out", "optout"}
OPT_IN_WORDS = {"start", "subscribe", "unstop", "opt in", "optin"}
ATTACHMENT_TYPES = {"image": "image", "video": "video", "audio": "audio", "file": "file", "share": "share", "ig_reel": "reel", "reel": "reel",
                    "story_mention": "story_mention", "animated_image": "image", "sticker": "image"}


@dataclass
class IngestResult:
    dispatch: list[uuid.UUID] = field(default_factory=list)  # inbound message ids that DM automation should look at
    comments: list[uuid.UUID] = field(default_factory=list)  # instagram_comments rows that comment automation should look at
    referrals: list[tuple[uuid.UUID, str, uuid.UUID]] = field(default_factory=list)  # (account_id, ref, conversation_id) for ig.me ref links
    messages: int = 0
    duplicates: int = 0
    other: int = 0


def verify_signature(raw_body: bytes, header: str | None, secret: str) -> bool:
    if not header or not secret or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header.removeprefix("sha256="))


async def _claim(db: AsyncSession, tenant_id: uuid.UUID | None, key: str, payload: dict) -> bool:
    """Insert the event key; False means we've already processed it (Meta delivers at least once)."""
    stmt = (
        pg_insert(WebhookIngress)
        .values(id=uuid.uuid4(), tenant_id=tenant_id, source="instagram", event_key=key[:200], payload=payload, processed=True)
        .on_conflict_do_nothing(index_elements=["event_key"])
        .returning(WebhookIngress.id)
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


def _ts(value: int | str | None) -> datetime:
    """Instagram timestamps are milliseconds in `messaging` events."""
    try:
        v = int(value)
        return datetime.fromtimestamp(v / 1000 if v > 10**11 else v, tz=timezone.utc)
    except (TypeError, ValueError, OverflowError):
        return datetime.now(timezone.utc)


def parse_message(m: dict) -> tuple[str, str | None, dict]:
    """Return (our type, display body, extras) for an inbound `message` object."""
    payload: dict = {}
    extras: dict = {}
    text = m.get("text")
    if m.get("quick_reply"):
        payload["reply_id"] = m["quick_reply"].get("payload")
        payload["kind"] = "quick_reply"
    reply_to = m.get("reply_to") or {}
    if reply_to.get("story"):
        payload["story"] = {"id": reply_to["story"].get("id"), "url": reply_to["story"].get("url")}
        extras["payload"] = payload
        return "story_reply", text, extras
    if reply_to.get("mid"):
        payload["reply_to"] = reply_to["mid"]
    attachments = m.get("attachments") or []
    if attachments and not text:
        a = attachments[0]
        kind = ATTACHMENT_TYPES.get(a.get("type", ""), "file")
        url = (a.get("payload") or {}).get("url")
        payload["attachments"] = [{"type": x.get("type"), "url": (x.get("payload") or {}).get("url")} for x in attachments]
        extras.update(media_url=url, payload=payload)
        return kind, None, extras
    if m.get("is_unsupported"):
        extras["payload"] = {**payload, "unsupported": True}
        return "text", "[Message type not supported by the Instagram API]", extras
    extras["payload"] = payload
    return "text", text or "", extras


async def ingest(db: AsyncSession, payload: dict) -> IngestResult:
    result = IngestResult()
    for entry in payload.get("entry", []):
        ig_id = str(entry.get("id", ""))
        account = (await db.execute(select(InstagramAccount).where(InstagramAccount.ig_user_id == ig_id))).scalar_one_or_none()
        if account is None or account.status == "disconnected":
            log.info("webhook for unknown/disconnected instagram account %s", ig_id)
            result.other += 1
            continue
        account.last_webhook_at = datetime.now(timezone.utc)
        for event in entry.get("messaging", []) or []:
            try:
                await _handle_messaging(db, account, event, result)
            except Exception:  # noqa: BLE001 — one bad event must not drop the rest of the batch
                log.exception("instagram messaging event failed")
                await db.rollback()
        for change in entry.get("changes", []) or []:
            field_name, value = change.get("field"), change.get("value") or {}
            try:
                if field_name in {"comments", "live_comments"}:
                    row_id = await comments.log_comment(db, account, value, is_live=field_name == "live_comments")
                    if row_id:
                        result.comments.append(row_id)
                    else:
                        result.duplicates += 1
                    await db.commit()
                else:
                    result.other += 1
            except Exception:  # noqa: BLE001
                log.exception("instagram change failed field=%s", field_name)
                await db.rollback()
    await db.commit()
    return result


async def _handle_messaging(db: AsyncSession, account: InstagramAccount, event: dict, result: IngestResult) -> None:
    sender = str((event.get("sender") or {}).get("id") or "")
    recipient = str((event.get("recipient") or {}).get("id") or "")
    if "message" in event:
        m = event["message"] or {}
        if m.get("is_deleted"):
            result.other += 1
            return
        if m.get("is_echo") or sender == account.ig_user_id:
            await _handle_echo(db, account, recipient, m, event, result)
        else:
            await _handle_inbound(db, account, sender, event, result)
    elif "postback" in event:
        await _handle_postback(db, account, sender, event, result)
    elif "reaction" in event:
        await _handle_reaction(db, account, sender, event, result)
    elif "read" in event:
        await _handle_read(db, account, sender, event)
    elif "referral" in event:
        await _handle_referral(db, account, sender, event, result)
    else:
        result.other += 1


async def _contact_conv(db: AsyncSession, account: InstagramAccount, igsid: str):
    contact, contact_created = await messaging.upsert_contact(db, account.tenant_id, igsid, source="instagram")
    conv, conv_created = await messaging.get_or_create_conversation(db, account, contact)
    return contact, contact_created, conv, conv_created


async def _enrich_profile(db: AsyncSession, account: InstagramAccount, contact) -> None:
    """Username, name, picture and follower status of a new contact — best effort, never blocks the message."""
    try:
        p = await client_for(account).user_profile(contact.ig_user_id)
    except GraphError as exc:
        log.info("profile lookup failed for %s: %s", contact.ig_user_id, exc)
        return
    contact.ig_username = p.get("username") or contact.ig_username
    contact.profile_pic_url = p.get("profile_pic") or contact.profile_pic_url
    contact.follower_count = p.get("follower_count", contact.follower_count)
    if "is_user_follow_business" in p:
        contact.is_follower = bool(p["is_user_follow_business"])
    if contact.name.startswith("Instagram user "):
        contact.name = messaging.display_name(contact.ig_username, p.get("name"), contact.ig_user_id)


async def _store_inbound(db: AsyncSession, account: InstagramAccount, igsid: str, *, mid: str, mtype: str, body: str | None, extras: dict,
                         sent_at: datetime, result: IngestResult, dispatch: bool = True) -> Message | None:
    contact, contact_created, conv, conv_created = await _contact_conv(db, account, igsid)
    if contact_created or contact.ig_username is None:
        await _enrich_profile(db, account, contact)
    now = datetime.now(timezone.utc)

    payload = dict(extras.pop("payload", {}) or {})
    lowered = (body or "").strip().lower() if mtype == "text" else ""
    if lowered in OPT_OUT_WORDS:
        payload["opt_out"] = True
        if not contact.opted_out:
            contact.opted_out, contact.opted_out_at = True, now
            await outbound_webhooks.emit(account.tenant_id, "contact_opted_out", {"contact_id": str(contact.id), "username": contact.ig_username})
    elif lowered in OPT_IN_WORDS and contact.opted_out:
        payload["opt_in"] = True
        contact.opted_out, contact.opted_out_at = False, None

    msg = Message(tenant_id=account.tenant_id, conversation_id=conv.id, direction="in", type=mtype, body=body, external_id=mid, status="received",
                  sender_type="contact", payload=payload, created_at=sent_at, sent_at=sent_at, **extras)
    db.add(msg)
    await db.flush()

    if mtype != "reaction":
        conv.last_inbound_at = sent_at
        conv.last_message_at = max(sent_at, conv.last_message_at or sent_at)
        conv.last_message_preview = messaging.preview_for(mtype, body)
        conv.unread_count = (conv.unread_count or 0) + 1
        if conv.status == "resolved":
            conv.status = "open"  # a new message reopens the conversation
    contact.last_contacted_at = now

    if conv_created:
        tenant = await db.get(Tenant, account.tenant_id)
        if tenant is not None:
            await assignment.assign_new(db, tenant, conv)
            flag_modified(tenant, "settings")
    await db.commit()
    if contact_created:
        try:
            await pipeline.auto_deal_for_contact(db, account.tenant_id, contact)
        except Exception:  # noqa: BLE001 — a CRM side effect must never lose an inbound message
            log.exception("auto-creating a deal failed")
            await db.rollback()

    result.messages += 1
    if dispatch and mtype != "reaction":
        result.dispatch.append(msg.id)
    await outbound_webhooks.emit(account.tenant_id, "message_received", {"message_id": str(msg.id), "from": contact.ig_username or igsid, "type": mtype, "text": body})
    if contact_created:
        await outbound_webhooks.emit(account.tenant_id, "contact_created", {"contact_id": str(contact.id), "username": contact.ig_username, "source": contact.source})
    if conv_created:
        await outbound_webhooks.emit(account.tenant_id, "conversation_created", {"conversation_id": str(conv.id), "username": contact.ig_username})
    return msg


async def _handle_inbound(db: AsyncSession, account: InstagramAccount, igsid: str, event: dict, result: IngestResult) -> None:
    m = event["message"]
    mid = m.get("mid")
    if not mid or not igsid or not await _claim(db, account.tenant_id, f"ig:msg:{mid}", event):
        result.duplicates += 1
        return
    mtype, body, extras = parse_message(m)
    # A first message sent from an ig.me ref link carries the ref; that link's welcome replies instead of the usual automation.
    ref = str(((m.get("referral") or {}).get("ref")) or "")
    has_link = bool(ref) and (await db.execute(select(RefLink.id).where(RefLink.account_id == account.id, RefLink.ref == ref[:60], RefLink.enabled.is_(True)))).first() is not None
    msg = await _store_inbound(db, account, igsid, mid=mid, mtype=mtype, body=body, extras=extras, sent_at=_ts(event.get("timestamp")), result=result,
                               dispatch=not has_link)
    if has_link and msg is not None:
        result.referrals.append((account.id, ref, msg.conversation_id))


async def _handle_postback(db: AsyncSession, account: InstagramAccount, igsid: str, event: dict, result: IngestResult) -> None:
    pb = event["postback"] or {}
    key = pb.get("mid") or f"{igsid}:{event.get('timestamp')}:{pb.get('payload')}"
    if not await _claim(db, account.tenant_id, f"ig:postback:{key}", event):
        result.duplicates += 1
        return
    # Ice breakers and template buttons arrive as postbacks; treat them like a tapped reply so flows/replies can react.
    extras = {"payload": {"reply_id": pb.get("payload"), "reply_title": pb.get("title"), "kind": "postback"}}
    await _store_inbound(db, account, igsid, mid=pb.get("mid") or key, mtype="postback", body=pb.get("title"), extras=extras,
                         sent_at=_ts(event.get("timestamp")), result=result)


async def _handle_referral(db: AsyncSession, account: InstagramAccount, igsid: str, event: dict, result: IngestResult) -> None:
    """Someone opened a DM through an ig.me link or an ad. Instagram opens the 24h reply window for this event."""
    ref = event["referral"] or {}
    if not await _claim(db, account.tenant_id, f"ig:ref:{igsid}:{event.get('timestamp')}:{ref.get('ref')}", event):
        result.duplicates += 1
        return
    contact, contact_created, conv, _ = await _contact_conv(db, account, igsid)
    if contact_created or contact.ig_username is None:
        await _enrich_profile(db, account, contact)
    contact.ad_attribution = {k: ref.get(k) for k in ("ref", "source", "type", "ad_id") if ref.get(k)}
    ts = _ts(event.get("timestamp"))
    conv.last_inbound_at = max(ts, conv.last_inbound_at or ts)
    await db.commit()
    if ref.get("ref"):
        result.referrals.append((account.id, str(ref["ref"]), conv.id))
    result.other += 1


async def _handle_echo(db: AsyncSession, account: InstagramAccount, igsid: str, m: dict, event: dict, result: IngestResult) -> None:
    """Messages the business sent. Ours are already stored; ones sent from the Instagram app itself are added to the inbox."""
    mid = m.get("mid")
    if not mid or not igsid:
        return
    existing = (await db.execute(select(Message.id).where(Message.tenant_id == account.tenant_id, Message.external_id == mid).limit(1))).first()
    if existing or not await _claim(db, account.tenant_id, f"ig:echo:{mid}", event):
        result.duplicates += 1
        return
    mtype, body, extras = parse_message(m)
    contact, _, conv, _ = await _contact_conv(db, account, igsid)
    ts = _ts(event.get("timestamp"))
    db.add(Message(tenant_id=account.tenant_id, conversation_id=conv.id, direction="out", type=mtype, body=body, external_id=mid, status="sent",
                   sender_type="agent", payload={**(extras.pop("payload", {}) or {}), "via": "instagram_app"}, created_at=ts, sent_at=ts, **extras))
    conv.last_message_at = max(ts, conv.last_message_at or ts)
    conv.last_message_preview = messaging.preview_for(mtype, body)
    await db.commit()
    result.messages += 1


async def _handle_reaction(db: AsyncSession, account: InstagramAccount, igsid: str, event: dict, result: IngestResult) -> None:
    r = event["reaction"] or {}
    key = f"ig:react:{r.get('mid')}:{igsid}:{r.get('action')}:{event.get('timestamp')}"
    if not await _claim(db, account.tenant_id, key, event):
        result.duplicates += 1
        return
    if r.get("action") == "unreact":
        return
    extras = {"payload": {"emoji": r.get("emoji") or r.get("reaction"), "reacted_to": r.get("mid")}}
    await _store_inbound(db, account, igsid, mid=key, mtype="reaction", body=r.get("emoji") or "❤️", extras=extras,
                         sent_at=_ts(event.get("timestamp")), result=result, dispatch=False)


async def _handle_read(db: AsyncSession, account: InstagramAccount, igsid: str, event: dict) -> None:
    """Seen receipt: mark our outbound messages in this conversation as read."""
    contact, _, conv, _ = await _contact_conv(db, account, igsid)
    ts = _ts(event.get("timestamp"))
    rows = (await db.execute(select(Message).where(Message.conversation_id == conv.id, Message.direction == "out", Message.status == "sent",
                                                   Message.created_at <= ts))).scalars()
    for msg in rows:
        msg.status, msg.read_at = "read", ts
    await db.commit()
