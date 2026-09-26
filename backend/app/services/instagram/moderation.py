"""
Comment moderation: hide (or delete) spam and abusive comments on your posts before any automation reacts to them.
Rules live in tenant.settings["moderation"]; see app/api/settings.py for the shape.
"""

from __future__ import annotations

import logging
import re

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment_automation import InstagramComment
from app.models.instagram_account import InstagramAccount
from app.models.tenant import Tenant
from app.services.ai import agent as ai_agent
from app.services.instagram.accounts import client_for
from app.services.instagram.graph import GraphError

log = logging.getLogger(__name__)

_LINK = re.compile(r"(https?://|www\.|\b[\w-]+\.(com|in|net|org|xyz|io|co|ly|me|link|site|online|shop)\b)", re.I)
_MENTION = re.compile(r"@[\w.]+")


def _norm(text: str) -> str:
    return " " + " ".join(re.split(r"[^\w]+", (text or "").casefold())).strip() + " "


def rule_reason(cfg: dict, text: str) -> str | None:
    """The first rule the comment breaks, or None."""
    text = text or ""
    padded = _norm(text)
    for k in cfg.get("keywords") or []:
        k_norm = _norm(k).strip()
        if k_norm and f" {k_norm} " in padded:
            return f"keyword: {k}"
    if cfg.get("hide_links") and _LINK.search(text):
        return "contains a link"
    limit = int(cfg.get("max_mentions") or 0)
    if limit and len(_MENTION.findall(text)) > limit:
        return f"more than {limit} mentions"
    return None


async def check(db: AsyncSession, tenant: Tenant, text: str) -> str | None:
    cfg = (tenant.settings or {}).get("moderation") or {}
    if not cfg.get("enabled"):
        return None
    reason = rule_reason(cfg, text)
    if reason or not cfg.get("use_ai") or not (text or "").strip():
        return reason
    try:
        verdict = await ai_agent.classify_comment(db, tenant, text)
    except ai_agent.AIUnavailable as exc:
        log.info("AI moderation skipped: %s", exc)
        return None
    return f"AI: {verdict}" if verdict in {"spam", "abusive"} else None


async def apply(account: InstagramAccount, row: InstagramComment, action: str, reason: str) -> str | None:
    """Hide / unhide / delete the comment on Instagram and record it on the row. Returns an error message or None."""
    client = client_for(account)
    try:
        if action == "delete":
            await client.delete_comment(row.comment_id)
        else:
            await client.hide_comment(row.comment_id, hide=action == "hide")
    except GraphError as exc:
        return str(exc)
    row.moderation = {"hide": "hidden", "delete": "deleted", "unhide": None}[action]
    row.moderation_reason = reason[:120] if action != "unhide" else None
    return None
