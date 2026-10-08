"""
Decides what (if anything) automation does when a contact messages the business. Order matters:

  0. an unlock step of a comment automation (follow-gate button tap, or the email / phone they were asked for)
  1. opt-out / opt-in keyword confirmation
  2. a flow run that is waiting for this reply
  3. (human took over? -> stop; automation never talks over an agent)
  3b. first reply after a comment-automation DM -> that automation's follow-up flow
  4. welcome message (first ever message) and away message (outside business hours)
  5. keyword flows -> "any message" flows
  5b. story mention / story reply auto-reply
  6. custom replies (exact -> contains -> any)
  7. AI intent match against custom replies
  8. AI agent
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import session as db_session
from app.models.automation_execution import AutomationExecution
from app.models.automation_flow import AutomationFlow
from app.models.contact import Contact
from app.models.conversation import Conversation, Message
from app.models.custom_reply import CustomReply
from app.models.tenant import Tenant
from app.models.instagram_account import InstagramAccount
from app.services import assignment, entitlements, templating
from app.services.ai import agent as ai_agent
from app.services.automation import flow_engine
from app.services.instagram import comments as comment_automation
from app.services.instagram import links, messaging

log = logging.getLogger(__name__)

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
AWAY_COOLDOWN = timedelta(hours=12)
TEXT_TYPES = {"text", "postback", "story_reply"}


def is_open_now(settings: dict, now: datetime | None = None) -> bool:
    """Business hours from tenant.settings['business_hours']. Unconfigured = always open (so no away message is ever sent)."""
    cfg = (settings or {}).get("business_hours") or {}
    days = cfg.get("days")
    if not days:
        return True
    try:
        tz = ZoneInfo(cfg.get("timezone") or "UTC")
    except Exception:  # noqa: BLE001 — unknown tz name
        tz = ZoneInfo("UTC")
    local = (now or datetime.now(timezone.utc)).astimezone(tz)
    day = days.get(DAYS[local.weekday()]) or {}
    if not day.get("enabled"):
        return False
    hhmm = local.strftime("%H:%M")
    return (day.get("start") or "00:00") <= hhmm < (day.get("end") or "23:59")


def _keywords(trigger: str) -> list[str]:
    return [k.strip().lower() for k in trigger.replace("\n", ",").split(",") if k.strip()]


def _text_matches(keywords: list[str], text: str, mode: str) -> bool:
    text = text.strip().lower()
    if mode == "exact":
        return text in keywords
    if mode == "any":
        return True
    return any(k in text for k in keywords)


async def dispatch_message(message_id: uuid.UUID) -> None:
    """Job entry point (services/jobs.py) — owns its own DB session; raises so the job is marked failed."""
    async with db_session.async_session_factory() as db:
        msg = await db.get(Message, message_id)
        if msg is None:
            return
        conv = await db.get(Conversation, msg.conversation_id)
        contact = await db.get(Contact, conv.contact_id)
        account = await db.get(InstagramAccount, conv.account_id)
        tenant = await db.get(Tenant, conv.tenant_id)
        if None in (conv, contact, account, tenant) or account.status == "disconnected":
            return
        await run(db, tenant, account, conv, contact, msg)


async def dispatch_inbound(message_id: uuid.UUID) -> None:
    """Same as dispatch_message, but never raises."""
    try:
        await dispatch_message(message_id)
    except Exception:  # noqa: BLE001
        log.exception("automation dispatch failed for message %s", message_id)


async def _bot_text(db: AsyncSession, account, conv, contact, text: str, marker: str, ctx: dict | None = None) -> Message | None:
    try:
        return await messaging.send_message(db, account, conv, contact, kind="text", text=templating.render(text, contact, ctx), sender_type="bot",
                                            extra_payload={"auto": marker}, strict=False)
    except messaging.SendBlocked as exc:
        log.info("auto reply '%s' blocked: %s", marker, exc.message)
        return None


async def _recent_auto(db: AsyncSession, conv: Conversation, marker: str, within: timedelta) -> bool:
    row = (await db.execute(select(Message.id).where(
        Message.conversation_id == conv.id, Message.direction == "out", Message.payload["auto"].as_string() == marker,
        Message.created_at > datetime.now(timezone.utc) - within).limit(1))).first()
    return row is not None


async def run(db: AsyncSession, tenant: Tenant, account: InstagramAccount, conv: Conversation, contact: Contact, msg: Message) -> str:
    """Returns which stage handled the message (useful for tests/logging)."""
    settings = tenant.settings or {}
    text = (msg.body or "").strip()

    # 0 — a comment automation is waiting on this person (unlock tap, or the email/phone it asked for)
    if await comment_automation.handle_gate_reply(db, account, conv, contact, msg):
        return "gate"

    # 1 — opt-out / opt-in acknowledgements
    if (msg.payload or {}).get("opt_out"):
        await _bot_text(db, account, conv, contact, "You've been unsubscribed and won't receive marketing messages from us. Reply START to subscribe again.", "optout")
        return "opt_out"
    if (msg.payload or {}).get("opt_in"):
        await _bot_text(db, account, conv, contact, "Welcome back! You're subscribed again.", "optin")
        return "opt_in"

    # 2 — resume a waiting flow
    waiting = (await db.execute(select(AutomationExecution).where(
        AutomationExecution.contact_id == contact.id, AutomationExecution.status == "waiting", AutomationExecution.waiting_for == "reply"
    ).order_by(AutomationExecution.created_at.desc()).limit(1))).scalar_one_or_none()
    if waiting is not None:
        await flow_engine.resume_on_reply(db, waiting, msg)
        return "flow_resumed"

    # 3 — a human owns this conversation
    if conv.inbox_status == "intervened":
        return "human"

    # 3b — they answered a comment-automation DM: continue in that automation's flow
    if await _comment_follow_up(db, conv, contact, msg, text):
        return "comment_follow_up"

    inbound_count = (await db.execute(select(func.count()).select_from(Message).where(Message.conversation_id == conv.id, Message.direction == "in", Message.type != "reaction"))).scalar_one()
    is_first = inbound_count == 1

    # 4 — welcome / away
    auto = settings.get("auto_replies") or {}
    if is_first and (auto.get("welcome") or {}).get("enabled") and (auto["welcome"].get("message") or "").strip():
        await _bot_text(db, account, conv, contact, auto["welcome"]["message"], "welcome")
    if (auto.get("away") or {}).get("enabled") and (auto["away"].get("message") or "").strip() and not is_open_now(settings):
        if not await _recent_auto(db, conv, "away", AWAY_COOLDOWN):
            await _bot_text(db, account, conv, contact, auto["away"]["message"], "away")

    # 5 — flows
    flows = (await db.execute(select(AutomationFlow).where(AutomationFlow.tenant_id == tenant.id, AutomationFlow.status == "published"))).scalars().all()
    if await _try_flows(db, flows, conv, contact, msg, text, is_first):
        return "flow"

    # 5b — story mention / story reply auto-reply
    if msg.type in {"story_mention", "story_reply"} and await _story_reply(db, account, conv, contact, msg, auto):
        return "story_reply"

    # 6 — custom replies
    if settings.get("custom_replies_enabled", True) and text:
        replies = list((await db.execute(select(CustomReply).where(CustomReply.tenant_id == tenant.id, CustomReply.enabled.is_(True))
                                         .order_by(CustomReply.priority.desc(), CustomReply.created_at))).scalars())
        hit = None
        for mode in ("exact", "contains", "any"):
            hit = next((r for r in replies if r.match_type == mode and _text_matches(_keywords(r.trigger), text, mode)), None)
            if hit:
                break
        # The toggle can still be on from before a downgrade, so check the plan too.
        if hit is None and settings.get("intent_matching_enabled") and replies and (await entitlements.features_for(db, tenant)).get("intent_matching", True):
            hit = await _intent_match(db, tenant, replies, text)
        if hit is not None:
            await _apply_reply(db, tenant, account, conv, contact, hit)
            return "custom_reply"

    # 7/8 — AI agent
    ai_cfg = ai_agent.get_config(tenant)
    if ai_cfg["enabled"] and msg.type in TEXT_TYPES and text:
        return await _ai_reply(db, tenant, account, conv, contact, text)
    return "none"


async def _try_flows(db: AsyncSession, flows: list[AutomationFlow], conv: Conversation, contact: Contact, msg: Message, text: str, is_first: bool) -> bool:
    def start_data(f: AutomationFlow) -> dict:
        node = next((n for n in (f.published_snapshot or {}).get("nodes", []) if n.get("type") == "start"), None)
        return (node or {}).get("data") or {}

    ordered = sorted(flows, key=lambda f: {"keyword": 0, "story_reply": 1, "contact_created": 2, "incoming_message": 3}.get(f.trigger_type, 9))
    for f in ordered:
        d = start_data(f)
        if f.trigger_type == "keyword":
            hit = bool(text) and _text_matches([k.lower() for k in d.get("keywords", [])], text, d.get("match", "contains"))
        elif f.trigger_type == "contact_created":
            hit = is_first
        elif f.trigger_type == "incoming_message":
            hit = True
        elif f.trigger_type == "story_reply":
            hit = msg.type in {"story_reply", "story_mention"}
        else:
            hit = False
        if not hit:
            continue
        cooldown = float(d.get("cooldown_hours", 24 if f.trigger_type in {"incoming_message", "contact_created"} else 0))
        if cooldown:
            recent = (await db.execute(select(AutomationExecution.id).where(
                AutomationExecution.flow_id == f.id, AutomationExecution.contact_id == contact.id,
                AutomationExecution.created_at > datetime.now(timezone.utc) - timedelta(hours=cooldown)).limit(1))).first()
            if recent:
                continue
        started = await flow_engine.start_flow(db, f, contact, conv, context={"trigger_text": text})
        if started is not None:
            return True
    return False


async def _comment_follow_up(db: AsyncSession, conv: Conversation, contact: Contact, msg: Message, text: str) -> bool:
    """If the last thing we sent was a comment-automation DM that names a follow-up flow, start it now that the window is open."""
    last_out = (await db.execute(select(Message).where(Message.conversation_id == conv.id, Message.direction == "out", Message.is_internal.is_(False),
                                                       Message.created_at < msg.created_at).order_by(Message.created_at.desc()).limit(1))).scalar_one_or_none()
    flow_id = (last_out.payload or {}).get("follow_up_flow_id") if last_out and last_out.sender_type == "comment" else None
    if not flow_id or (last_out.payload or {}).get("follow_up_started"):
        return False
    last_out.payload = {**(last_out.payload or {}), "follow_up_started": True}
    await db.flush()
    flow = await db.get(AutomationFlow, uuid.UUID(flow_id))
    if flow is None or flow.tenant_id != conv.tenant_id or flow.status != "published":
        await db.commit()
        return False
    started = await flow_engine.start_flow(db, flow, contact, conv, context={"trigger_text": text, "comment_text": (last_out.payload or {}).get("comment_text")})
    await db.commit()
    return started is not None


async def _story_reply(db: AsyncSession, account, conv: Conversation, contact: Contact, msg: Message, auto: dict) -> bool:
    cfg = auto.get(msg.type) or {}
    if not cfg.get("enabled") or not (cfg.get("message") or "").strip():
        return False
    if await _recent_auto(db, conv, msg.type, timedelta(hours=24)):  # one thank-you a day, however many times they mention you
        return True
    text = templating.render(cfg["message"], contact)
    buttons = [{"title": cfg["link_title"], "url": cfg["link_url"]}] if cfg.get("link_title") and cfg.get("link_url") else []
    if buttons:
        buttons = await links.track_buttons(db, contact.tenant_id, buttons, source="story", contact_id=contact.id)
    try:
        await messaging.send_message(db, account, conv, contact, kind="buttons" if buttons else "text", text=text, buttons=buttons or None,
                                     sender_type="bot", extra_payload={"auto": msg.type}, strict=False)
    except messaging.SendBlocked as exc:
        log.info("story auto-reply blocked: %s", exc.message)
        return False
    if (cfg.get("tag") or "").strip():
        contact.tags = sorted({*(contact.tags or []), cfg["tag"].strip()[:50]})
        await db.commit()
    return True


async def _intent_match(db, tenant, replies: list[CustomReply], text: str) -> CustomReply | None:
    cands = [(r.id, ", ".join(_keywords(r.trigger))) for r in replies if r.match_type != "any"]
    try:
        chosen = await ai_agent.match_intent(db, tenant, text, cands)
    except ai_agent.AIUnavailable as exc:
        log.info("intent matching skipped: %s", exc)
        return None
    return next((r for r in replies if r.id == chosen), None)


async def _apply_reply(db, tenant, account, conv, contact, reply: CustomReply) -> None:
    if reply.reply_text.strip():
        await _bot_text(db, account, conv, contact, reply.reply_text, "custom_reply")
    reply.conversations_sent = (reply.conversations_sent or 0) + 1
    if reply.flow_id:
        flow = await db.get(AutomationFlow, reply.flow_id)
        if flow and flow.tenant_id == tenant.id:
            await flow_engine.start_flow(db, flow, contact, conv)
    await db.commit()


async def _ai_reply(db, tenant, account, conv, contact, text: str) -> str:
    try:
        result = await ai_agent.answer(db, tenant, conv, contact, text)
    except ai_agent.AIUnavailable as exc:
        log.info("AI reply skipped for tenant %s: %s", tenant.id, exc)
        return "ai_unavailable"
    await db.commit()  # persist usage counter + collected lead fields
    await _bot_text_ai(db, account, conv, contact, result.reply)
    if result.handoff:
        conv.inbox_status = "intervened"
        conv.labels = sorted({*(conv.labels or []), "needs-human"})
        await assignment.assign_new(db, tenant, conv)
        await db.commit()
        return "ai_handoff"
    return "ai"


async def _bot_text_ai(db, account, conv, contact, text: str) -> None:
    try:
        await messaging.send_message(db, account, conv, contact, kind="text", text=text, sender_type="ai", extra_payload={"auto": "ai"}, strict=False)
    except messaging.SendBlocked as exc:
        log.info("AI reply blocked: %s", exc.message)
