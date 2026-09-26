"""Scheduled posts: plan photos, carousels, reels and stories and publish them at the right time."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.models.instagram_account import InstagramAccount
from app.models.media_asset import MediaAsset
from app.models.scheduled_post import ScheduledPost
from app.services import media_library
from app.services.instagram import publishing
from app.services.instagram.accounts import client_for
from app.services.instagram.graph import GraphError

router = APIRouter(prefix="/posts", tags=["posts"])


class MediaItem(BaseModel):
    """Either a public link (`url` + `type`) or a file from the media library (`asset_id`)."""
    url: str = Field(default="", max_length=2000)
    type: Literal["image", "video"] = "image"
    asset_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _one_source(self):
        if self.asset_id is None and len(self.url) < 8:
            raise ValueError("Each media item needs a link or a file from the media library.")
        return self


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


def _media_out(items: list[dict] | None) -> list[dict]:
    # Library files: rebuild the link so it follows PUBLIC_BASE_URL if that is set after scheduling.
    return [{**m, "url": media_library.file_url(m["file"])} if m.get("file") and media_library.publicly_reachable() else m for m in items or []]


def _out(p: ScheduledPost, username: str | None = None) -> dict:
    return {
        "id": str(p.id), "account_id": str(p.account_id), "account_username": username, "kind": p.kind, "caption": p.caption, "media": _media_out(p.media),
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


async def _media(db: AsyncSession, ctx: Ctx, body: PostIn, base: str) -> list[dict]:
    """Media as stored on the post: links as given; library files with their public link, type and size."""
    ids = {m.asset_id for m in body.media if m.asset_id}
    assets = {a.id: a for a in (await db.execute(select(MediaAsset).where(MediaAsset.id.in_(ids), MediaAsset.tenant_id == ctx.tenant_id))).scalars()} if ids else {}
    out = []
    for m in body.media:
        if m.asset_id is None:
            out.append({"url": m.url, "type": m.type})
            continue
        a = assets.get(m.asset_id)
        if a is None:
            raise HTTPException(status_code=422, detail={"error": "One of the files is no longer in your media library."})
        out.append({"url": media_library.file_url(a.file_name, base), "type": a.kind, "asset_id": str(a.id), "file": a.file_name, "width": a.width, "height": a.height})
    return out


def _check(body: PostIn, media: list[dict]) -> datetime:
    publish_now = body.publish_now or body.scheduled_at is None
    try:
        publishing.validate(body.kind, media, body.caption)
        if publish_now:
            publishing.check_files_reachable(media)
    except publishing.PublishError as exc:
        raise HTTPException(status_code=422, detail={"error": exc.message})
    return datetime.now(timezone.utc) if publish_now else _when(body.scheduled_at)


def _when(scheduled_at: datetime) -> datetime:
    now = datetime.now(timezone.utc)
    when = scheduled_at if scheduled_at.tzinfo else scheduled_at.replace(tzinfo=timezone.utc)
    if when < now - timedelta(minutes=5):
        raise HTTPException(status_code=422, detail={"error": "Pick a time in the future."})
    if when > now + timedelta(days=75):
        raise HTTPException(status_code=422, detail={"error": "Posts can be scheduled up to 75 days ahead."})
    return when


@router.get("")
async def list_posts(status_: str | None = Query(None, alias="status"), start: datetime | None = None, end: datetime | None = None,
                     ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    """Newest first; `start`/`end` narrow it to a calendar range (by publish time, else scheduled time)."""
    q = (select(ScheduledPost, InstagramAccount.username).join(InstagramAccount, InstagramAccount.id == ScheduledPost.account_id)
         .where(ScheduledPost.tenant_id == ctx.tenant_id))
    if status_:
        q = q.where(ScheduledPost.status == status_)
    when = func.coalesce(ScheduledPost.published_at, ScheduledPost.scheduled_at)
    if start:
        q = q.where(when >= start)
    if end:
        q = q.where(when < end)
    rows = (await db.execute(q.order_by(ScheduledPost.scheduled_at.desc()).limit(1000 if start or end else 300))).all()
    return [_out(p, u) for p, u in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: PostIn, request: Request, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    account = await _account(db, ctx, body.account_id)
    media = await _media(db, ctx, body, str(request.base_url))
    when = _check(body, media)
    p = ScheduledPost(tenant_id=ctx.tenant_id, account_id=account.id, created_by=ctx.user_id, kind=body.kind, caption=body.caption,
                      media=media, first_comment=body.first_comment, scheduled_at=when, status="scheduled")
    db.add(p)
    await db.commit()
    if body.publish_now or body.scheduled_at is None:
        await publishing.step(db, p, account)  # images usually publish immediately; videos continue in the background
    await db.refresh(p)
    return _out(p, account.username)


@router.put("/{post_id}")
async def update(post_id: uuid.UUID, body: PostIn, request: Request, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    p = await _owned(db, ctx, post_id)
    if p.status not in {"scheduled", "failed", "cancelled"}:
        raise HTTPException(status_code=409, detail={"error": "This post is already being published."})
    account = await _account(db, ctx, body.account_id)
    media = await _media(db, ctx, body, str(request.base_url))
    when = _check(body, media)
    p.account_id, p.kind, p.caption, p.first_comment, p.scheduled_at = account.id, body.kind, body.caption, body.first_comment, when
    p.media = media
    p.status, p.error, p.attempts, p.container_id, p.child_container_ids = "scheduled", None, 0, None, []
    await db.commit()
    if body.publish_now:
        await publishing.step(db, p, account)
    await db.refresh(p)
    return _out(p, account.username)


class RescheduleIn(BaseModel):
    scheduled_at: datetime


@router.post("/{post_id}/reschedule")
async def reschedule(post_id: uuid.UUID, body: RescheduleIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    """Move a scheduled post to another time — the calendar's drag and drop."""
    p = await _owned(db, ctx, post_id)
    if p.status != "scheduled":
        raise HTTPException(status_code=409, detail={"error": "Only posts that haven't started publishing can be moved."})
    p.scheduled_at = _when(body.scheduled_at)
    await db.commit()
    account = await db.get(InstagramAccount, p.account_id)
    return _out(p, account.username if account else None)


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
