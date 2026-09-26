"""Analytics + notifications derived from live data (no separate metrics store)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db
from app.models.comment_automation import CommentAutomation, InstagramComment
from app.models.contact import Contact
from app.models.conversation import Conversation, Message
from app.models.instagram_account import InstagramAccount
from app.models.tenant import Tenant, User
from app.models.tracked_link import TrackedLink
from app.services.entitlements import require_feature
from app.services import quotas
from app.services.ai import agent as ai_agent

router = APIRouter(tags=["analytics"])


def _series(rows: list[tuple], days: int, start: datetime, keys: list[str]) -> list[dict]:
    """Zero-fill a per-day series so charts have a point for every day."""
    by_day = {r[0].isoformat(): r[1:] for r in rows}
    out = []
    for i in range(days):
        d = (start + timedelta(days=i)).date().isoformat()
        vals = by_day.get(d, tuple(0 for _ in keys))
        out.append({"date": d, **{k: int(v or 0) for k, v in zip(keys, vals)}})
    return out


@router.get("/analytics/overview", dependencies=[Depends(require_feature("conversation_analytics"))])
async def overview(days: int = Query(30, ge=1, le=90), ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days - 1)).replace(hour=0, minute=0, second=0, microsecond=0)
    t = ctx.tenant_id
    day = cast(Message.created_at, Date)

    msg_rows = (await db.execute(
        select(day, func.count().filter(Message.direction == "in"), func.count().filter((Message.direction == "out") & Message.is_internal.is_(False)))
        .where(Message.tenant_id == t, Message.created_at >= start).group_by(day).order_by(day))).all()
    conv_day = cast(Conversation.created_at, Date)
    conv_rows = (await db.execute(select(conv_day, func.count()).where(Conversation.tenant_id == t, Conversation.created_at >= start).group_by(conv_day).order_by(conv_day))).all()
    con_day = cast(Contact.created_at, Date)
    contact_rows = (await db.execute(select(con_day, func.count()).where(Contact.tenant_id == t, Contact.created_at >= start).group_by(con_day).order_by(con_day))).all()

    m = Message
    # Instagram reports "seen" but not "delivered", so delivered == sent here.
    delivery = (await db.execute(select(
        func.count().filter(m.status.in_(("sent", "read"))), func.count().filter(m.status.in_(("sent", "read"))), func.count().filter(m.status == "read"),
        func.count().filter(m.status == "failed"),
    ).where(m.tenant_id == t, m.direction == "out", m.is_internal.is_(False), m.created_at >= start))).one()

    # first response time: first reply (bot/agent/AI/flow, not a comment-automation DM) after the first inbound message, per conversation
    first_in = select(Message.conversation_id.label("cid"), func.min(Message.created_at).label("t_in")).where(Message.tenant_id == t, Message.direction == "in", Message.created_at >= start).group_by(Message.conversation_id).subquery()
    first_out = select(Message.conversation_id.label("cid"), func.min(Message.created_at).label("t_out")).where(
        Message.tenant_id == t, Message.direction == "out", Message.is_internal.is_(False), Message.sender_type.in_(("agent", "bot", "ai", "flow"))).group_by(Message.conversation_id).subquery()
    resp = (await db.execute(select(func.avg(func.extract("epoch", first_out.c.t_out - first_in.c.t_in)), func.count()).select_from(first_in.join(first_out, first_in.c.cid == first_out.c.cid))
                             .where(first_out.c.t_out >= first_in.c.t_in))).one()

    conv = (await db.execute(select(
        func.count().filter(Conversation.status == "open"), func.count().filter(Conversation.status == "resolved"), func.count().filter(Conversation.inbox_status == "intervened"),
        func.count().filter(Conversation.assigned_user_id.is_(None) & (Conversation.status == "open")),
    ).where(Conversation.tenant_id == t))).one()

    agents = (await db.execute(
        select(User.id, User.full_name, User.email, func.count(Message.id), func.count(func.distinct(Message.conversation_id)))
        .join(User, User.id == Message.sender_user_id).where(Message.tenant_id == t, Message.created_at >= start, Message.direction == "out", Message.is_internal.is_(False), Message.sender_type == "agent")
        .group_by(User.id, User.full_name, User.email).order_by(func.count(Message.id).desc()).limit(20))).all()

    c = InstagramComment
    com = (await db.execute(select(func.count(), func.count().filter(c.outcome == "matched"), func.count().filter(c.public_reply_id.is_not(None)),
                                   func.count().filter(c.dm_message_id.is_not(None)), func.count().filter(c.outcome == "failed"))
                            .where(c.tenant_id == t, c.created_at >= start, c.outcome != "own_comment"))).one()
    com_day = cast(c.created_at, Date)
    com_rows = (await db.execute(select(com_day, func.count(), func.count().filter(c.dm_message_id.is_not(None)))
                                 .where(c.tenant_id == t, c.created_at >= start, c.outcome != "own_comment").group_by(com_day).order_by(com_day))).all()

    # Top posts by comments, with the thumbnail/caption we already know from automations' post pickers.
    post_rows = (await db.execute(select(c.media_id, func.count(), func.count().filter(c.outcome == "matched"), func.count().filter(c.dm_message_id.is_not(None)))
                                  .where(c.tenant_id == t, c.created_at >= start, c.outcome != "own_comment", c.media_id.is_not(None))
                                  .group_by(c.media_id).order_by(func.count().desc()).limit(8))).all()
    previews: dict[str, dict] = {}
    for (mp,) in (await db.execute(select(CommentAutomation.media_preview).where(CommentAutomation.tenant_id == t))).all():
        for m in mp or []:
            if isinstance(m, dict) and m.get("id"):
                previews.setdefault(m["id"], m)
    clicks = (await db.execute(select(func.count(), func.coalesce(func.sum(TrackedLink.clicks), 0), func.count().filter(TrackedLink.clicks > 0))
                               .where(TrackedLink.tenant_id == t, TrackedLink.created_at >= start))).one()

    totals = (await db.execute(select(func.count(), func.count().filter(Contact.opted_out.is_(True))).where(Contact.tenant_id == t))).one()
    sent = delivery[0] or 0
    pct = lambda n: round(100 * n / sent, 1) if sent else 0.0  # noqa: E731
    return {
        "days": days,
        "messages": _series(msg_rows, days, start, ["inbound", "outbound"]),
        "conversations_started": _series(conv_rows, days, start, ["count"]),
        "new_contacts": _series(contact_rows, days, start, ["count"]),
        "delivery": {"sent": sent, "delivered": delivery[1], "read": delivery[2], "failed": delivery[3], "delivered_pct": pct(delivery[1]), "read_pct": pct(delivery[2]), "failed_pct": pct(delivery[3])},
        "first_response": {"avg_seconds": round(float(resp[0])) if resp[0] is not None else None, "conversations": resp[1]},
        "conversations": {"open": conv[0], "resolved": conv[1], "human_handled": conv[2], "unassigned": conv[3]},
        "agents": [{"user_id": str(a[0]), "name": a[1] or a[2], "messages": a[3], "conversations": a[4]} for a in agents],
        "comments": {"received": com[0], "matched": com[1], "public_replies": com[2], "dms_sent": com[3], "failed": com[4],
                     "series": _series(com_rows, days, start, ["comments", "dms"])},
        "top_posts": [{"media_id": mid, "comments": n, "matched": m, "dms": d, "caption": (previews.get(mid) or {}).get("caption"),
                       "thumbnail_url": (previews.get(mid) or {}).get("thumbnail_url"), "permalink": (previews.get(mid) or {}).get("permalink")}
                      for mid, n, m, d in post_rows],
        "links": {"sent": clicks[0], "clicks": int(clicks[1]), "clicked": clicks[2]},
        "contacts": {"total": totals[0], "opted_out": totals[1]},
    }


@router.get("/notifications")
async def notifications(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    t, now = ctx.tenant_id, datetime.now(timezone.utc)
    items: list[dict] = []

    unread = (await db.execute(select(func.coalesce(func.sum(Conversation.unread_count), 0), func.count().filter(Conversation.unread_count > 0))
                               .where(Conversation.tenant_id == t, Conversation.status == "open"))).one()
    for a in (await db.execute(select(InstagramAccount).where(InstagramAccount.tenant_id == t, InstagramAccount.status != "disconnected"))).scalars():
        if a.status == "error":
            items.append({"id": f"acct-{a.id}", "type": "error", "title": f"@{a.username} needs attention", "detail": (a.last_error or "Access token rejected.")[:160],
                          "href": "/dashboard/instagram", "at": (a.updated_at or now).isoformat()})
        elif not a.webhooks_subscribed:
            items.append({"id": f"hooks-{a.id}", "type": "warning", "title": f"@{a.username} isn't receiving comments or DMs",
                          "detail": "Webhooks aren't switched on for this account yet — open Instagram settings and click Refresh.", "href": "/dashboard/instagram", "at": now.isoformat()})
        if a.token_expires_at and a.token_expires_at - now < timedelta(days=7):
            items.append({"id": f"token-{a.id}", "type": "warning", "title": f"@{a.username}'s access expires soon",
                          "detail": "Reconnect the account so automations keep running.", "href": "/dashboard/instagram", "at": now.isoformat()})
    failed = (await db.execute(select(func.count()).select_from(InstagramComment).where(
        InstagramComment.tenant_id == t, InstagramComment.outcome == "failed", InstagramComment.created_at > now - timedelta(days=1)))).scalar_one()
    if failed:
        items.append({"id": f"comments-failed-{now.date().isoformat()}", "type": "warning", "title": f"{failed} comment automation{'s' if failed != 1 else ''} failed today",
                      "detail": "Open the activity log to see why.", "href": "/dashboard/comment-automations", "at": now.isoformat()})
    tenant = await db.get(Tenant, t)
    if tenant:
        used = ai_agent.usage_this_month(tenant)
        limit = (await quotas.quotas_for(db, t)).get("ai_replies_included_per_month")
        if limit and limit > 0 and used >= 0.8 * limit and ai_agent.get_config(tenant)["enabled"] and not ai_agent.get_config(tenant)["has_own_key"]:
            items.append({"id": "ai-quota", "type": "warning", "title": "AI replies almost used up", "detail": f"{used} of {limit} included replies used this month.", "href": "/dashboard/ai-agent", "at": now.isoformat()})
    items.sort(key=lambda i: i["at"], reverse=True)
    return {"unread_messages": int(unread[0]), "unread_conversations": unread[1], "items": items[:20]}
