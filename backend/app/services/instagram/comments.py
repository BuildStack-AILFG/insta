"""
Comment automations: when someone comments on a post, find the automation that matches it and
  1. reply publicly under the comment (a random variant, so it doesn't look robotic), and
  2. send the commenter a private reply DM (Meta allows one per comment, within 7 days) — either the link itself, or an
     unlock step first (follow the account / share an email or phone), with the link delivered once they pass it.

The webhook handler only logs the comment (fast, idempotent); `run_comment` does the Graph calls in a background task.
"""

from __future__ import annotations

import logging
import random
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import session as db_session
from app.models.comment_automation import CommentAutomation, CommentGate, InstagramComment
from app.models.contact import Contact
from app.models.conversation import Conversation, Message
from app.models.instagram_account import InstagramAccount
from app.models.tenant import Tenant
from app.services import outbound_webhooks
from app.services.instagram import links, messaging, moderation
from app.services.phone import InvalidPhone, normalize_phone
from app.services.instagram.accounts import client_for
from app.services.instagram.graph import GraphError

log = logging.getLogger(__name__)

_WORD = re.compile(r"[^\w#@]+", re.UNICODE)
_EMAIL = re.compile(r"[^@\s<>]+@[^@\s<>]+\.[a-zA-Z]{2,}")
GATE_PREFIX = "GATE:"
MAX_GATE_ATTEMPTS = 3
DEFAULTS = {
    "follow": ("Tap below and I'll send it right over 👇", "Send me the link", "Almost there! Follow @{account} first, then tap the button again 👇"),
    "email": ("Drop your email here and I'll send it right away 📩", "", "Hmm, that doesn't look like an email — could you check it?"),
    "phone": ("Share your phone number (with country code) and I'll send it right away 📲", "", "Hmm, that doesn't look like a phone number — could you check it?"),
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize(text: str) -> str:
    return " ".join(_WORD.split((text or "").casefold())).strip()


def matches(automation: CommentAutomation, text: str) -> bool:
    """Keyword match on the normalised comment. `exact` compares the whole comment; `contains` looks for whole words/phrases."""
    norm = normalize(text)
    padded = f" {norm} "
    if any(f" {normalize(k)} " in padded for k in automation.exclude_keywords or [] if normalize(k)):
        return False
    if automation.match_type == "any":
        return True
    keywords = [normalize(k) for k in automation.keywords or [] if normalize(k)]
    if automation.match_type == "exact":
        return norm in keywords
    return any(f" {k} " in padded for k in keywords)


def render(text: str, username: str | None) -> str:
    handle = f"@{username}" if username else "there"
    return (text or "").replace("{{username}}", handle).replace("{{ username }}", handle)


def media_applies(automation: CommentAutomation, media_id: str | None, is_live: bool = False) -> bool:
    # Instagram Live comments only go to "During Live" automations, and those ignore regular post comments.
    if automation.media_scope == "live" or is_live:
        return automation.media_scope == "live" and is_live
    if automation.media_scope == "all":
        return True
    return bool(media_id) and media_id in (automation.media_ids or [])


# ---- webhook side: log the comment --------------------------------------------------------------------------------

async def log_comment(db: AsyncSession, account: InstagramAccount, value: dict, *, is_live: bool = False) -> uuid.UUID | None:
    """Insert the comment once (Meta retries deliveries). Returns the row id when automation should look at it, else None."""
    comment_id = str(value.get("id") or "")
    if not comment_id:
        return None
    author = value.get("from") or {}
    media = value.get("media") or {}
    own = str(author.get("id") or "") == account.ig_user_id
    stmt = (
        pg_insert(InstagramComment)
        .values(id=uuid.uuid4(), tenant_id=account.tenant_id, account_id=account.id, comment_id=comment_id, parent_id=value.get("parent_id"),
                media_id=str(media.get("id") or "") or None, media_product_type=media.get("media_product_type"), from_ig_id=str(author.get("id") or "") or None,
                from_username=author.get("username"), text=value.get("text"), is_live=is_live, outcome="own_comment" if own else "pending", details={})
        .on_conflict_do_nothing(index_elements=["comment_id"])
        .returning(InstagramComment.id)
    )
    row_id = (await db.execute(stmt)).scalar_one_or_none()
    # Our own replies come back through the webhook too — never react to them (that would loop).
    return None if (row_id is None or own) else row_id


# ---- background side: run the automation --------------------------------------------------------------------------

async def process_comment(comment_row_id: uuid.UUID) -> None:
    """Job entry point (services/jobs.py) — owns its own DB session; raises so the job is marked failed."""
    async with db_session.async_session_factory() as db:
        row = await db.get(InstagramComment, comment_row_id)
        account = await db.get(InstagramAccount, row.account_id) if row else None
        # Only ever handle a comment once: a re-run job must not send a second public reply / DM.
        if row is None or account is None or account.status == "disconnected" or row.outcome != "pending":
            return
        await process(db, account, row)


async def run_comment(comment_row_id: uuid.UUID) -> None:
    """Same as process_comment, but never raises."""
    try:
        await process_comment(comment_row_id)
    except Exception:  # noqa: BLE001
        log.exception("comment automation failed for comment row %s", comment_row_id)


async def _bind_next_post(db: AsyncSession, account: InstagramAccount, automations: list[CommentAutomation], media_id: str | None) -> None:
    """'Next post' automations attach themselves to the first post published after they were created."""
    waiting = [a for a in automations if a.media_scope == "next"]
    if not waiting or not media_id:
        return
    try:
        media = await client_for(account).get_media(media_id)
    except GraphError as exc:
        log.info("could not read media %s for next-post automations: %s", media_id, exc)
        return
    try:
        published = datetime.fromisoformat(str(media.get("timestamp")).replace("Z", "+00:00").replace("+0000", "+00:00"))
    except ValueError:
        return
    for a in waiting:
        if published > a.created_at:
            a.media_scope, a.media_ids = "specific", [media_id]
            a.media_preview = [{"id": media_id, "caption": (media.get("caption") or "")[:200], "thumbnail_url": media.get("thumbnail_url") or media.get("media_url"),
                                "permalink": media.get("permalink")}]
    await db.flush()


async def find_automation(db: AsyncSession, account: InstagramAccount, row: InstagramComment) -> CommentAutomation | None:
    automations = list((await db.execute(select(CommentAutomation).where(
        CommentAutomation.account_id == account.id, CommentAutomation.status == "active").order_by(CommentAutomation.created_at))).scalars())
    await _bind_next_post(db, account, automations, row.media_id)
    candidates = [a for a in automations if media_applies(a, row.media_id, row.is_live) and matches(a, row.text or "")]
    # A post-specific automation beats an "all posts" one; within a tier, keyword triggers beat "any comment".
    candidates.sort(key=lambda a: (a.media_scope == "all", a.match_type == "any"))
    return candidates[0] if candidates else None


async def process(db: AsyncSession, account: InstagramAccount, row: InstagramComment) -> str:
    """Returns the outcome (useful for tests/logging)."""
    # Moderation first: spam and abuse are hidden and never get an automated reply.
    tenant = await db.get(Tenant, account.tenant_id)
    reason = await moderation.check(db, tenant, row.text or "") if tenant else None
    if reason:
        action = ((tenant.settings or {}).get("moderation") or {}).get("action", "hide")
        error = await moderation.apply(account, row, action, reason)
        row.outcome, row.error = ("failed", f"Moderation failed: {error}"[:1000]) if error else ("moderated", None)
        await db.commit()
        if not error:
            await outbound_webhooks.emit(account.tenant_id, "comment_moderated", {"comment_id": row.comment_id, "media_id": row.media_id, "username": row.from_username,
                                                                                  "text": row.text, "action": action, "reason": reason})
        return row.outcome

    automation = await find_automation(db, account, row)
    if automation is None:
        row.outcome = "no_match"
        await db.commit()
        return row.outcome
    row.automation_id = automation.id

    if automation.once_per_user and row.from_ig_id:
        seen = (await db.execute(select(InstagramComment.id).where(
            InstagramComment.automation_id == automation.id, InstagramComment.from_ig_id == row.from_ig_id,
            InstagramComment.outcome == "matched", InstagramComment.id != row.id).limit(1))).first()
        if seen:
            row.outcome = "skipped_repeat"
            await db.commit()
            return row.outcome

    client = client_for(account)
    errors: list[str] = []
    public_sent = dm_sent = False

    replies = [r for r in automation.public_replies or [] if r.strip()]
    if automation.public_reply_enabled and replies:
        try:
            row.public_reply_id = await client.reply_to_comment(row.comment_id, render(random.choice(replies), row.from_username)) or None
            public_sent = True
        except GraphError as exc:
            errors.append(f"Public reply failed: {exc}")

    if automation.dm_enabled and automation.dm_text.strip() and row.from_ig_id:
        opted_out = (await db.execute(select(Contact.opted_out).where(Contact.tenant_id == account.tenant_id, Contact.ig_user_id == row.from_ig_id))).scalar_one_or_none()
        if opted_out:
            row.details = {**(row.details or {}), "dm_skipped": "opted_out"}
        else:
            dm_sent = await _send_private_reply(db, account, automation, row, errors)

    row.outcome = "matched" if (public_sent or dm_sent or not errors) else "failed"
    row.error = "; ".join(errors)[:1000] or None
    await db.execute(update(CommentAutomation).where(CommentAutomation.id == automation.id).values(
        comments_matched=CommentAutomation.comments_matched + 1,
        public_replies_sent=CommentAutomation.public_replies_sent + int(public_sent),
        dms_sent=CommentAutomation.dms_sent + int(dm_sent),
        last_triggered_at=utcnow(),
    ))
    await db.commit()
    await outbound_webhooks.emit(account.tenant_id, "comment_automation_triggered", {
        "automation_id": str(automation.id), "automation": automation.name, "comment_id": row.comment_id, "media_id": row.media_id,
        "username": row.from_username, "text": row.text, "public_reply": public_sent, "dm": dm_sent,
    })
    return row.outcome


def _gate_texts(automation: CommentAutomation, account: InstagramAccount, username: str | None) -> tuple[str, str, str]:
    prompt, button, retry = DEFAULTS[automation.gate]
    fill = lambda t: render(t, username).replace("{account}", account.username).replace("@@", "@")  # noqa: E731
    return fill(automation.gate_prompt or prompt), (automation.gate_button or button)[:20], fill(automation.gate_retry_text or retry)


def _unlock_button(title: str, gate_id: uuid.UUID) -> list[dict]:
    return [{"type": "postback", "title": title, "payload": f"{GATE_PREFIX}{gate_id}"}]


async def _send_private_reply(db: AsyncSession, account: InstagramAccount, automation: CommentAutomation, row: InstagramComment, errors: list[str]) -> bool:
    # The contact + conversation exist before sending so gates and tracked links can point at them.
    contact, _ = await messaging.upsert_contact(db, account.tenant_id, row.from_ig_id, username=row.from_username, source="comment")
    conv, _ = await messaging.get_or_create_conversation(db, account, contact)
    row.contact_id = contact.id
    payload = {"auto": "comment", "automation_id": str(automation.id), "comment_id": row.comment_id, "comment_text": row.text, "media_id": row.media_id}
    client = client_for(account)
    mid, error = None, None

    if automation.gate in DEFAULTS:
        prompt, button, _ = _gate_texts(automation, account, row.from_username)
        gate = await _open_gate(db, automation, contact, conv)
        payload["gate"] = automation.gate
        text, graph_buttons = prompt, (_unlock_button(button, gate.id) if automation.gate == "follow" else [])
        if graph_buttons:
            payload["buttons"] = [{"title": button, "url": None}]
    else:
        variant = variant_for(automation, contact)
        text = render(dm_text_for(automation, variant), row.from_username)
        if variant:
            payload["variant"] = variant
        shown = await _dm_buttons(db, automation, contact, variant)
        graph_buttons = messaging.link_buttons(shown)
        if shown:
            payload["buttons"] = [{"title": b["title"], "url": b.get("target_url") or b.get("url")} for b in shown]
        if automation.flow_id:
            payload["follow_up_flow_id"] = str(automation.flow_id)  # started by the dispatcher when they reply
    try:
        if graph_buttons:
            mid = await client.send_buttons(None, text, graph_buttons, comment_id=row.comment_id)
        else:
            mid = await client.private_reply(row.comment_id, text)
    except GraphError as exc:
        error = str(exc)
        errors.append(f"DM failed: {exc}")

    # Record the DM on the commenter's conversation so it shows in the inbox.
    await messaging.record_outbound(db, account, conv, kind="buttons" if graph_buttons else "text", body=text, external_id=mid, sender_type="comment",
                                    payload=payload, error=error)
    row.dm_message_id = mid
    contact.tags = sorted({*(contact.tags or []), f"commented:{automation.name[:40]}"})
    return error is None


def variant_for(automation: CommentAutomation, contact: Contact) -> str | None:
    """A/B arm for this person: stable per contact, so repeat deliveries and click tracking line up."""
    if not (automation.dm_text_b or "").strip():
        return None
    return "B" if contact.id.int % 2 else "A"


def dm_text_for(automation: CommentAutomation, variant: str | None) -> str:
    return automation.dm_text_b if variant == "B" else automation.dm_text


async def _dm_buttons(db: AsyncSession, automation: CommentAutomation, contact: Contact, variant: str | None = None) -> list[dict]:
    buttons = [b for b in automation.dm_buttons or [] if b.get("title") and b.get("url")]
    if automation.track_clicks and buttons:
        buttons = await links.track_buttons(db, automation.tenant_id, buttons, source="comment_automation", contact_id=contact.id,
                                            automation_id=automation.id, variant=variant)
    return buttons


async def _open_gate(db: AsyncSession, automation: CommentAutomation, contact: Contact, conv: Conversation) -> CommentGate:
    """One gate per (automation, person). A new comment re-opens it so they can try again."""
    stmt = (
        pg_insert(CommentGate)
        .values(id=uuid.uuid4(), tenant_id=automation.tenant_id, automation_id=automation.id, contact_id=contact.id, conversation_id=conv.id,
                kind=automation.gate, status="waiting", attempts=0)
        .on_conflict_do_update(constraint="uq_comment_gates_automation_contact",
                               set_={"kind": automation.gate, "conversation_id": conv.id, "attempts": 0,
                                     "status": CommentGate.status.op("||")("")})  # keep 'passed' if they already unlocked it
        .returning(CommentGate.id)
    )
    gate_id = (await db.execute(stmt)).scalar_one()
    gate = await db.get(CommentGate, gate_id)
    if gate.status == "abandoned":
        gate.status = "waiting"
    return gate


# ---- unlocking: button taps and answers arriving as DMs ------------------------------------------------------------

async def deliver(db: AsyncSession, account: InstagramAccount, automation: CommentAutomation, conv: Conversation, contact: Contact) -> Message | None:
    """Send the automation's real DM (text + link buttons) now that the conversation is open."""
    variant = variant_for(automation, contact)
    buttons = await _dm_buttons(db, automation, contact, variant)
    extra = {"auto": "comment", "automation_id": str(automation.id), "delivery": True}
    if variant:
        extra["variant"] = variant
    if automation.flow_id:
        extra["follow_up_flow_id"] = str(automation.flow_id)
    try:
        return await messaging.send_message(db, account, conv, contact, kind="buttons" if buttons else "text", text=render(dm_text_for(automation, variant), contact.ig_username),
                                            buttons=buttons or None, sender_type="comment", extra_payload=extra, strict=False)
    except messaging.SendBlocked as exc:
        log.info("gate delivery blocked for %s: %s", contact.id, exc.message)
        return None


async def _pass(db: AsyncSession, account: InstagramAccount, automation: CommentAutomation, gate: CommentGate, conv: Conversation, contact: Contact) -> None:
    first = gate.status != "passed"
    gate.status, gate.passed_at = "passed", gate.passed_at or utcnow()
    if first:
        await db.execute(update(CommentAutomation).where(CommentAutomation.id == automation.id).values(gates_passed=CommentAutomation.gates_passed + 1))
    await db.flush()
    await deliver(db, account, automation, conv, contact)


async def handle_gate_reply(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, msg: Message) -> bool:
    """Called by the DM dispatcher first. Returns True when the message was an unlock tap or a gate answer."""
    reply_id = str((msg.payload or {}).get("reply_id") or "")
    if msg.type == "postback" and reply_id.startswith(GATE_PREFIX):
        try:
            gate = await db.get(CommentGate, uuid.UUID(reply_id[len(GATE_PREFIX):]))
        except ValueError:
            return False
        if gate is None or gate.contact_id != contact.id:
            return False
        automation = await db.get(CommentAutomation, gate.automation_id)
        if automation is None:
            return False
        await _check_follow(db, account, automation, gate, conv, contact)
        return True

    if msg.type != "text" or not (msg.body or "").strip():
        return False
    gate = (await db.execute(select(CommentGate).where(
        CommentGate.contact_id == contact.id, CommentGate.status == "waiting", CommentGate.kind.in_(("email", "phone")),
    ).order_by(CommentGate.updated_at.desc()).limit(1))).scalar_one_or_none()
    if gate is None:
        return False
    automation = await db.get(CommentAutomation, gate.automation_id)
    if automation is None:
        return False
    value = await _parse_answer(db, gate.kind, msg.body or "", contact.tenant_id)
    _, _, retry = _gate_texts(automation, account, contact.ig_username)
    if value is None:
        gate.attempts = (gate.attempts or 0) + 1
        if gate.attempts >= MAX_GATE_ATTEMPTS:
            gate.status = "abandoned"  # stop insisting; normal automation handles their messages again
            await db.commit()
            return False
        await _say(db, account, conv, contact, retry, "gate_retry")
        return True
    if gate.kind == "email":
        contact.email = value
    else:
        contact.phone = await _free_phone(db, contact, value)
    contact.custom_fields = {**(contact.custom_fields or {}), gate.kind: value}
    contact.tags = sorted({*(contact.tags or []), "lead"})
    await _pass(db, account, automation, gate, conv, contact)
    await outbound_webhooks.emit(contact.tenant_id, "lead_captured", {
        "contact_id": str(contact.id), "username": contact.ig_username, gate.kind: value, "automation_id": str(automation.id), "source": "comment_automation",
    })
    return True


async def _check_follow(db: AsyncSession, account: InstagramAccount, automation: CommentAutomation, gate: CommentGate, conv: Conversation, contact: Contact) -> None:
    follows = None
    try:
        profile = await client_for(account).user_profile(contact.ig_user_id)
        if "is_user_follow_business" in profile:
            follows = bool(profile["is_user_follow_business"])
    except GraphError as exc:
        log.info("follow check failed for %s: %s", contact.ig_user_id, exc)
    if follows is not None:
        contact.is_follower = follows
    if follows:
        await _pass(db, account, automation, gate, conv, contact)
        return
    _, button, retry = _gate_texts(automation, account, contact.ig_username)
    gate.attempts = (gate.attempts or 0) + 1
    try:
        await messaging.send_message(db, account, conv, contact, kind="buttons", text=retry,
                                     buttons=[{"title": button, "payload": f"{GATE_PREFIX}{gate.id}"}, {"title": f"Open @{account.username}"[:20], "url": f"https://instagram.com/{account.username}"}],
                                     sender_type="comment", extra_payload={"auto": "gate_retry", "automation_id": str(automation.id)}, strict=False)
    except messaging.SendBlocked as exc:
        log.info("follow reminder blocked: %s", exc.message)
    await db.commit()


async def _say(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, text: str, marker: str) -> None:
    try:
        await messaging.send_message(db, account, conv, contact, kind="text", text=text, sender_type="comment", extra_payload={"auto": marker}, strict=False)
    except messaging.SendBlocked as exc:
        log.info("gate message blocked: %s", exc.message)
    await db.commit()


async def _parse_answer(db: AsyncSession, kind: str, text: str, tenant_id: uuid.UUID) -> str | None:
    if kind == "email":
        m = _EMAIL.search(text.strip())
        return m.group(0).lower() if m else None
    tenant = await db.get(Tenant, tenant_id)
    cc = str((tenant.settings or {}).get("default_country_code", "")) if tenant else ""
    try:
        return normalize_phone(text, cc)
    except InvalidPhone:
        return None


async def _free_phone(db: AsyncSession, contact: Contact, phone: str) -> str | None:
    """Phones are unique per workspace; if another contact already has it (e.g. an imported lead), keep it only in custom fields."""
    taken = (await db.execute(select(Contact.id).where(Contact.tenant_id == contact.tenant_id, Contact.phone == phone, Contact.id != contact.id).limit(1))).first()
    return contact.phone if taken else phone
