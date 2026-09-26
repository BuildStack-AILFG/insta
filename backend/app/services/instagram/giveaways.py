"""Giveaways: fetch every comment on a post from Instagram, apply the entry rules and pick random winners."""

from __future__ import annotations

import logging
import re
import secrets
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.comment_automation import Giveaway
from app.models.instagram_account import InstagramAccount
from app.services import outbound_webhooks
from app.services.instagram.accounts import client_for
from app.services.instagram.comments import normalize, render
from app.services.instagram.graph import GraphError

log = logging.getLogger(__name__)
_MENTION = re.compile(r"@([\w.]+)")


class GiveawayError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def eligible(g: Giveaway, account: InstagramAccount, comments: list[dict]) -> list[dict]:
    """Entries that pass the rules, oldest first; with unique_users each person's first qualifying comment counts once."""
    excluded = {u.strip().lstrip("@").casefold() for u in g.exclude_usernames or [] if u.strip()}
    keyword = normalize(g.keyword)
    out, seen = [], set()
    for c in sorted(comments, key=lambda x: str(x.get("timestamp") or "")):
        author = c.get("from") or {}
        ig_id = str(author.get("id") or "")
        username = (c.get("username") or author.get("username") or "").strip()
        text = c.get("text") or ""
        if not username or ig_id == account.ig_user_id or username.casefold() == account.username.casefold() or username.casefold() in excluded:
            continue
        if keyword and f" {keyword} " not in f" {normalize(text)} ":
            continue
        mentions = {m.casefold() for m in _MENTION.findall(text)} - {username.casefold(), account.username.casefold()}
        if len(mentions) < (g.min_mentions or 0):
            continue
        who = ig_id or username.casefold()
        if g.unique_users and who in seen:
            continue
        seen.add(who)
        out.append({"comment_id": str(c.get("id")), "ig_id": ig_id or None, "username": username, "text": text[:500], "timestamp": c.get("timestamp")})
    return out


async def draw(db: AsyncSession, g: Giveaway, account: InstagramAccount) -> Giveaway:
    try:
        comments = await client_for(account).list_comments(g.media_id)
    except GraphError as exc:
        raise GiveawayError(f"Couldn't load the post's comments from Instagram: {exc}", 502) from exc
    entries = eligible(g, account, comments)
    if not entries:
        raise GiveawayError("No comments match the entry rules yet.", 409)
    rng = secrets.SystemRandom()
    picked = rng.sample(entries, k=min(g.winners_count, len(entries)))
    g.winners = [{**w, "notified": False, "error": None} for w in picked]
    g.comments_total, g.entries_count = len(comments), len(entries)
    g.status, g.drawn_at, g.notified_at = "drawn", datetime.now(timezone.utc), None
    flag_modified(g, "winners")
    await db.commit()
    await outbound_webhooks.emit(g.tenant_id, "giveaway_drawn", {"giveaway_id": str(g.id), "name": g.name, "entries": g.entries_count,
                                                                  "winners": [w["username"] for w in g.winners]})
    return g


async def notify(db: AsyncSession, g: Giveaway, account: InstagramAccount, message: str) -> Giveaway:
    """DM each winner as a private reply to their winning comment (Instagram allows this within 7 days of the comment)."""
    client = client_for(account)
    winners = []
    for w in g.winners or []:
        if w.get("notified"):
            winners.append(w)
            continue
        try:
            await client.private_reply(w["comment_id"], render(message, w.get("username")))
            winners.append({**w, "notified": True, "error": None})
        except GraphError as exc:
            winners.append({**w, "notified": False, "error": str(exc)[:300]})
    g.winners, g.notify_message, g.notified_at = winners, message, datetime.now(timezone.utc)
    flag_modified(g, "winners")
    await db.commit()
    return g
