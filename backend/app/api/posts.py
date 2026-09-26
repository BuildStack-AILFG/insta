"""Scheduled posts: plan photos, carousels, reels and stories and publish them at the right time."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.models.instagram_account import InstagramAccount
from app.models.scheduled_post import ScheduledPost
from app.services.instagram import publishing
from app.services.instagram.accounts import client_for
from app.services.instagram.graph import GraphError

router = APIRouter(prefix="/posts", tags=["posts"])


class MediaItem(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    type: Literal["image", "video"]


class PostIn(BaseModel):
    account_id: uuid.UUID
    kind: Literal["image", "carousel", "reel", "story"]
    caption: str = Field(default="", max_length=publishing.MAX_CAPTION)
    media: list[MediaItem] = Field(min_length=1, max_length=10)
    first_comment: str = Field(default="", max_length=publishing.MAX_CAPTION)
    scheduled_at: datetime | None = None  # omitted = publish now
    publish_now: bool = False


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _out(p: ScheduledPost, username: str | None = None) -> dict:
    return {
        "id": str(p.id), "account_id": str(p.account_id), "account_username": username, "kind": p.kind, "caption": p.caption, "media": p.media or [],
        "first_comment": p.first_comment, "scheduled_at": _iso(p.scheduled_at), "status": p.status, "ig_media_id": p.ig_media_id, "permalink": p.permalink,
        "published_at": _iso(p.published_at), "error": p.error, "created_at": _iso(p.created_at),
    }


async def _account(db: AsyncSession, ctx: Ctx, account_id: uuid.UUID) -> InstagramAccount:
    account = await db.get(InstagramAccount, account_id)
    if account is None or account.tenant_id != ctx.tenant_id or account.status == "disconnected":
        raise HTTPException(status_code=422, detail={"error": "Choose one of your connected Instagram accounts."})
    return account


async def _owned(db: AsyncSession, ctx: Ctx, post_id: uuid.UUID) -> ScheduledPost:
    p = await db.get(ScheduledPost, post_id)
    if p is None or p.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Post not found."})
    return p


def _check(body: PostIn) -> datetime:
    try:
        publishing.validate(body.kind, [m.model_dump() for m in body.media], body.caption)
    except publishing.PublishError as exc:
        raise HTTPException(status_code=422, detail={"error": exc.message})
    now = datetime.now(timezone.utc)
    if body.publish_now or body.scheduled_at is None:
        return now
    when = body.scheduled_at if body.scheduled_at.tzinfo else body.scheduled_at.replace(tzinfo=timezone.utc)
    if when < now - timedelta(minutes=5):
        raise HTTPException(status_code=422, detail={"error": "Pick a time in the future."})
    if when > now + timedelta(days=75):
        raise HTTPException(status_code=422, detail={"error": "Posts can be scheduled up to 75 days ahead."})
    return when


@router.get("")
async def list_posts(status_: str | None = Query(None, alias="status"), ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    q = (select(ScheduledPost, InstagramAccount.username).join(InstagramAccount, InstagramAccount.id == ScheduledPost.account_id)
         .where(ScheduledPost.tenant_id == ctx.tenant_id))
    if status_:
        q = q.where(ScheduledPost.status == status_)
    rows = (await db.execute(q.order_by(ScheduledPost.scheduled_at.desc()).limit(300))).all()
    return [_out(p, u) for p, u in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: PostIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    account = await _account(db, ctx, body.account_id)
    when = _check(body)
    p = ScheduledPost(tenant_id=ctx.tenant_id, account_id=account.id, created_by=ctx.user_id, kind=body.kind, caption=body.caption,
                      media=[m.model_dump() for m in body.media], first_comment=body.first_comment, scheduled_at=when, status="scheduled")
    db.add(p)
    await db.commit()
    if body.publish_now or body.scheduled_at is None:
        await publishing.step(db, p, account)  # images usually publish immediately; videos continue in the background
    await db.refresh(p)
    return _out(p, account.username)


@router.put("/{post_id}")
async def update(post_id: uuid.UUID, body: PostIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    p = await _owned(db, ctx, post_id)
    if p.status not in {"scheduled", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail={"error": "This post is already being published."})
    account = await _account(db, ctx, body.account_id)
    when = _check(body)
    p.account_id, p.kind, p.caption, p.first_comment, p.scheduled_at = account.id, body.kind, body.caption, body.first_comment, when
    p.media = [m.model_dump() for m in body.media]
    p.status, p.error, p.attempts, p.container_id, p.child_container_ids = "scheduled", None, 0, None, []
    await db.commit()
    if body.publish_now:
        await publishing.step(db, p, account)
    await db.refresh(p)
    return _out(p, account.username)


@router.post("/{post_id}/cancel")
async def cancel(post_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    p = await _owned(db, ctx, post_id)
    if p.status != "scheduled":
        raise HTTPException(status_code=409, detail={"error": "Only posts that haven't started publishing can be cancelled."})
    p.status = "cancelled"
    await db.commit()
    return _out(p)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete(post_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    """Removes it from GramForGrow. A post already published stays on Instagram."""
    p = await _owned(db, ctx, post_id)
    if p.status == "processing":
        raise HTTPException(status_code=409, detail={"error": "Wait until this post finishes publishing."})
    await db.delete(p)
    await db.commit()


@router.get("/limit")
async def publishing_limit(account_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    """How many posts this account has published in the last 24 hours, out of Instagram's limit."""
    account = await _account(db, ctx, account_id)
    try:
        data = await client_for(account).publishing_limit()
    except GraphError as exc:
        raise HTTPException(status_code=502, detail={"error": f"Couldn't read the publishing limit: {exc}"})
    return {"used": int(data.get("quota_usage") or 0), "limit": int(((data.get("config") or {}).get("quota_total")) or 100)}
