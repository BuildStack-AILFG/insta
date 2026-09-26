"""AI agent: knowledge-grounded Instagram DM replies via the Anthropic Messages API, with human handoff and lead qualification."""

from __future__ import annotations

import json
import logging
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import get_settings
from app.core.crypto import CryptoError, decrypt
from app.models.contact import Contact
from app.models.conversation import Conversation, Message
from app.models.tenant import Tenant
from app.services import quotas
from app.services.ai import knowledge

log = logging.getLogger(__name__)

AGENT_TYPES = {"support", "leads", "sales"}
DEFAULT_HANDOFF_WORDS = ["human", "agent", "representative", "real person", "talk to someone", "speak to someone", "customer care"]
HISTORY_LIMIT = 12


class AIUnavailable(Exception):
    """No usable API key / quota — automation should silently skip rather than error the webhook."""


@dataclass
class AIResult:
    reply: str
    handoff: bool = False
    confidence: float = 0.0
    collected: dict = field(default_factory=dict)


def get_config(tenant: Tenant) -> dict:
    cfg = dict((tenant.settings or {}).get("ai") or {})
    return {
        "enabled": bool(cfg.get("enabled", False)),
        "agent_type": cfg.get("agent_type") if cfg.get("agent_type") in AGENT_TYPES else "support",
        "business_name": cfg.get("business_name") or tenant.name,
        "persona_name": cfg.get("persona_name") or "Assistant",
        "tone": cfg.get("tone") or "friendly and professional",
        "language": cfg.get("language") or "match the customer's language",
        "instructions": cfg.get("instructions") or "",
        "handoff_keywords": cfg.get("handoff_keywords") or DEFAULT_HANDOFF_WORDS,
        "handoff_message": cfg.get("handoff_message") or "Sure — I'm connecting you with a member of our team. They'll reply here shortly.",
        "fallback_message": cfg.get("fallback_message") or "",
        "qualification_fields": cfg.get("qualification_fields") or [],
        "min_confidence": float(cfg.get("min_confidence", 0.35)),
        "model": cfg.get("model") or "",
        "has_own_key": bool(cfg.get("api_key_enc")),
    }


def _api_key(tenant: Tenant) -> tuple[str, bool]:
    """(key, is_tenant_key). Tenant-provided key wins; platform key is the metered fallback."""
    enc = ((tenant.settings or {}).get("ai") or {}).get("api_key_enc")
    if enc:
        try:
            return decrypt(enc), True
        except CryptoError as exc:
            raise AIUnavailable("Stored AI key could not be decrypted.") from exc
    key = get_settings().anthropic_api_key
    if not key:
        raise AIUnavailable("No AI key configured for this workspace.")
    return key, False


def _month_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def usage_this_month(tenant: Tenant) -> int:
    return int(((tenant.settings or {}).get("ai_usage") or {}).get(_month_key(), 0))


async def _meter(db: AsyncSession, tenant: Tenant, own_key: bool) -> None:
    """Enforce the plan's included AI replies when the platform's key is used; always count usage."""
    used = usage_this_month(tenant)
    if not own_key:
        limit = (await quotas.quotas_for(db, tenant.id)).get("ai_replies_included_per_month")
        if limit is not None and 0 <= limit <= used:
            raise AIUnavailable("Included AI replies for this month are used up.")
    usage = {_month_key(): used + 1}  # keep only the current month
    tenant.settings = {**(tenant.settings or {}), "ai_usage": usage}
    flag_modified(tenant, "settings")


async def complete(api_key: str, *, system: str, messages: list[dict], model: str | None = None, max_tokens: int = 700) -> str:
    settings = get_settings()
    payload = {"model": model or settings.ai_model, "max_tokens": max_tokens, "system": system, "messages": messages}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(45.0, connect=10.0)) as http:
            resp = await http.post(
                f"{settings.anthropic_api_base.rstrip('/')}/v1/messages", json=payload,
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise AIUnavailable(f"AI provider unreachable: {exc.__class__.__name__}") from exc
    if resp.status_code >= 400:
        try:
            msg = resp.json().get("error", {}).get("message", "")
        except Exception:  # noqa: BLE001
            msg = ""
        raise AIUnavailable(f"AI provider error {resp.status_code}: {msg[:200]}")
    blocks = resp.json().get("content", [])
    return "".join(b.get("text", "") for b in blocks if b.get("type") == "text").strip()


def _parse_json(raw: str) -> dict | None:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        return None


async def _history(db: AsyncSession, conv: Conversation) -> list[dict]:
    rows = (await db.execute(
        select(Message).where(Message.conversation_id == conv.id, Message.is_internal.is_(False), Message.body.is_not(None))
        .order_by(Message.created_at.desc()).limit(HISTORY_LIMIT)
    )).scalars().all()
    turns: list[dict] = []
    for m in reversed(rows):
        role = "user" if m.direction == "in" else "assistant"
        if turns and turns[-1]["role"] == role:
            turns[-1]["content"] += f"\n{m.body}"
        else:
            turns.append({"role": role, "content": m.body or ""})
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    return turns


def wants_human(text: str, keywords: list[str]) -> bool:
    lowered = f" {text.lower()} "
    return any(f" {k.lower().strip()} " in lowered or (len(k) > 5 and k.lower() in lowered) for k in keywords if k.strip())


def build_system_prompt(cfg: dict, contact: Contact, chunks: list[str], extra: str = "") -> str:
    role = {
        "support": "You answer customer questions accurately using the business knowledge below.",
        "leads": "You qualify inbound leads: be helpful, then naturally collect the missing qualification details, one question at a time.",
        "sales": "You help customers choose and buy: recommend from the knowledge below and guide them to a decision.",
    }[cfg["agent_type"]]
    kb = "\n\n".join(f"[{i + 1}] {c}" for i, c in enumerate(chunks)) or "(no relevant knowledge found)"
    fields = ""
    if cfg["agent_type"] == "leads" and cfg["qualification_fields"]:
        known = contact.custom_fields or {}
        missing = [f for f in cfg["qualification_fields"] if not known.get(f)]
        fields = (f"\nQualification fields to collect: {', '.join(cfg['qualification_fields'])}."
                  f"\nAlready known: {json.dumps({k: known[k] for k in cfg['qualification_fields'] if known.get(k)})}."
                  f"\nStill missing: {', '.join(missing) or 'none — thank them and say the team will follow up'}.")
    return (
        f"You are {cfg['persona_name']}, the Instagram DM assistant for {cfg['business_name']}. {role}\n"
        f"Tone: {cfg['tone']}. Language: {cfg['language']}.\n"
        "Rules:\n"
        "- Ground every factual claim in the knowledge below or the conversation. Never invent prices, policies, or availability.\n"
        "- If the knowledge doesn't cover the question, say you'll get a teammate to help and set handoff=true.\n"
        "- If the customer is upset, asks for a human, or needs an action you can't do (refunds, account changes), set handoff=true.\n"
        "- Instagram DM style: short, friendly, plain text (max 1000 characters), at most 3 short paragraphs, no markdown headings, no code blocks.\n"
        f"{('- Business instructions: ' + cfg['instructions']) if cfg['instructions'] else ''}{fields}{extra}\n\n"
        f"Customer name: {contact.name}\n\nKNOWLEDGE:\n{kb}\n\n"
        'Respond with ONLY a JSON object: {"reply": string, "handoff": boolean, "confidence": number between 0 and 1, '
        '"collected": object of qualification field -> value the customer just gave (empty object if none)}.'
    )


async def answer(db: AsyncSession, tenant: Tenant, conv: Conversation, contact: Contact, question: str, *, extra_instructions: str = "") -> AIResult:
    cfg = get_config(tenant)
    if wants_human(question, cfg["handoff_keywords"]):
        return AIResult(reply=cfg["handoff_message"], handoff=True, confidence=1.0)

    key, own = _api_key(tenant)
    await _meter(db, tenant, own)
    chunks = await knowledge.retrieve(db, tenant.id, question)
    history = await _history(db, conv)
    if not history or history[-1]["role"] != "user":
        history.append({"role": "user", "content": question})

    raw = await complete(key, system=build_system_prompt(cfg, contact, chunks, extra_instructions), messages=history, model=cfg["model"] or None)
    data = _parse_json(raw)
    if data is None:  # model ignored the format — treat the raw text as the reply, low confidence
        return AIResult(reply=raw[:1500], confidence=0.5)

    result = AIResult(
        reply=str(data.get("reply", "")).strip()[:3000], handoff=bool(data.get("handoff", False)),
        confidence=max(0.0, min(1.0, float(data.get("confidence", 0.6) or 0))), collected=data.get("collected") if isinstance(data.get("collected"), dict) else {},
    )
    if cfg["agent_type"] == "leads" and result.collected and cfg["qualification_fields"]:
        contact.custom_fields = {**(contact.custom_fields or {}), **{k: str(v) for k, v in result.collected.items() if k in cfg["qualification_fields"] and v}}
    if not result.handoff and result.confidence < cfg["min_confidence"]:
        result.handoff = True
        result.reply = cfg["fallback_message"] or cfg["handoff_message"]
    if not result.reply:
        result.handoff, result.reply = True, cfg["handoff_message"]
    return result


async def match_intent(db: AsyncSession, tenant: Tenant, text: str, candidates: list[tuple[uuid.UUID, str]]) -> uuid.UUID | None:
    """AI Intent Match: which saved reply (if any) does this message mean? Returns candidate id or None."""
    if not candidates:
        return None
    key, own = _api_key(tenant)
    await _meter(db, tenant, own)
    listing = "\n".join(f"{i}: {trigger}" for i, (_, trigger) in enumerate(candidates))
    raw = await complete(
        key, max_tokens=50,
        system=("You route Instagram direct messages. Given a customer message and a numbered list of intents, reply with ONLY the number of the intent the message clearly "
                "means, or -1 if none match. No other text.\n\nIntents:\n" + listing),
        messages=[{"role": "user", "content": text[:1000]}],
    )
    m = re.search(r"-?\d+", raw)
    if not m:
        return None
    idx = int(m.group(0))
    return candidates[idx][0] if 0 <= idx < len(candidates) else None


async def classify_comment(db: AsyncSession, tenant: Tenant, text: str) -> str:
    """Moderation: 'spam', 'abusive' or 'ok' for one Instagram comment. Raises AIUnavailable when AI isn't set up."""
    key, own = _api_key(tenant)
    await _meter(db, tenant, own)
    raw = await complete(
        key, max_tokens=5,
        system=("You moderate comments on a business's Instagram posts. Reply with exactly one word: spam (scams, bots, unrelated promotion, "
                "fake giveaways, 'DM me to earn'), abusive (hate, harassment, threats, sexual content) or ok (anything else, including complaints and criticism)."),
        messages=[{"role": "user", "content": text[:1000]}],
    )
    word = (raw or "").strip().lower().split()[:1]
    return word[0] if word and word[0] in {"spam", "abusive", "ok"} else "ok"


WRITE_BRIEFS = {
    "dm": "a friendly Instagram DM a business sends to someone who asked for something (max 400 characters, 0-2 emojis, may use {{username}})",
    "public_reply": "a short public reply under an Instagram comment telling the person to check their DMs (max 90 characters, may use {{username}})",
    "caption": "an Instagram post caption with a clear hook in the first line, a call to action, and at most 5 relevant hashtags at the end (max 900 characters)",
}


async def write_copy(db: AsyncSession, tenant: Tenant, purpose: str, brief: str, count: int = 3) -> list[str]:
    """Copywriter: `count` distinct options for a DM, public reply or caption. Raises AIUnavailable when AI isn't set up."""
    key, own = _api_key(tenant)
    await _meter(db, tenant, own)
    business = (get_config(tenant).get("business_name") or tenant.name or "").strip()
    raw = await complete(
        key, max_tokens=900,
        system=(f"You write copy for {business or 'a business'} on Instagram. Write {WRITE_BRIEFS[purpose]}. Match the language of the brief (e.g. Hinglish stays Hinglish). "
                f"Return ONLY a JSON array of {count} different strings, no other text."),
        messages=[{"role": "user", "content": brief[:1500]}],
    )
    try:
        start, end = raw.index("["), raw.rindex("]") + 1
        items = json.loads(raw[start:end])
    except (ValueError, json.JSONDecodeError):
        items = [line.strip("-• ").strip() for line in raw.splitlines() if line.strip()]
    return [str(x).strip()[:2200] for x in items if str(x).strip()][:count]
