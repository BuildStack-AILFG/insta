"""
Content publishing: turn a ScheduledPost into an Instagram post, reel, carousel or story.

Instagram publishes in two steps — create a media *container* (Instagram downloads the file from a public URL and, for
video, processes it), then publish the container. Video processing takes a while, so this runs as a small state machine
driven by the scheduler:

  scheduled --(due)--> processing (containers created) --(FINISHED)--> published
                                      \\--(ERROR / EXPIRED / timeout)--> failed
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import session as db_session
from app.models.instagram_account import InstagramAccount
from app.models.scheduled_post import ScheduledPost
from app.services import outbound_webhooks
from app.services.instagram.accounts import client_for
from app.services.instagram.graph import GraphClient, GraphError

log = logging.getLogger(__name__)

MAX_CAPTION = 2200
MAX_HASHTAGS = 30
PROCESSING_TIMEOUT = timedelta(minutes=30)
MAX_ATTEMPTS = 3


class PublishError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def validate(kind: str, media: list[dict], caption: str) -> None:
    """Instagram's shape rules, checked before anything is scheduled."""
    types = [m.get("type") for m in media]
    if kind == "image" and types != ["image"]:
        raise PublishError("A photo post needs exactly one image.")
    if kind == "reel" and types != ["video"]:
        raise PublishError("A reel needs exactly one video.")
    if kind == "story" and len(media) != 1:
        raise PublishError("A story needs exactly one image or video.")
    if kind == "carousel" and not 2 <= len(media) <= 10:
        raise PublishError("A carousel needs 2 to 10 images or videos.")
    if any(not str(m.get("url") or "").startswith("https://") for m in media):
        raise PublishError("Every file needs a public https:// link that Instagram can download.")
    if len(caption) > MAX_CAPTION:
        raise PublishError(f"Captions can be at most {MAX_CAPTION} characters.")
    if caption.count("#") > MAX_HASHTAGS:
        raise PublishError(f"Instagram allows at most {MAX_HASHTAGS} hashtags.")


def _file_param(item: dict) -> dict:
    return {"video_url": item["url"]} if item.get("type") == "video" else {"image_url": item["url"]}


async def _create_containers(client: GraphClient, post: ScheduledPost) -> None:
    item = post.media[0] if post.media else {}
    if post.kind == "image":
        post.container_id = await client.create_container(image_url=item["url"], caption=post.caption)
    elif post.kind == "reel":
        post.container_id = await client.create_container(media_type="REELS", video_url=item["url"], caption=post.caption)
    elif post.kind == "story":
        post.container_id = await client.create_container(media_type="STORIES", **_file_param(item))
    else:  # carousel: one child per item now; the parent is created once every child has finished processing
        ids = []
        for m in post.media:
            extra = {"media_type": "VIDEO"} if m.get("type") == "video" else {}
            ids.append(await client.create_container(is_carousel_item="true", **extra, **_file_param(m)))
        post.child_container_ids = ids


async def _fail(db: AsyncSession, post: ScheduledPost, message: str) -> None:
    post.status, post.error = "failed", message[:1000]
    await db.commit()
    await outbound_webhooks.emit(post.tenant_id, "post_failed", {"post_id": str(post.id), "kind": post.kind, "error": post.error})


async def step(db: AsyncSession, post: ScheduledPost, account: InstagramAccount) -> str:
    """Advance one post as far as it can go right now. Returns its status."""
    client = client_for(account)
    try:
        if post.status == "scheduled":
            post.status, post.attempts, post.error = "processing", (post.attempts or 0) + 1, None
            await _create_containers(client, post)
            await db.commit()

        if post.kind == "carousel" and not post.container_id:
            statuses = [await client.container_status(cid) for cid in post.child_container_ids or []]
            if any(s in {"ERROR", "EXPIRED"} for s in statuses):
                await _fail(db, post, "Instagram couldn't process one of the carousel files. Check the links and file formats.")
                return post.status
            if not all(s == "FINISHED" for s in statuses):
                return await _maybe_timeout(db, post)
            post.container_id = await client.create_container(media_type="CAROUSEL", children=",".join(post.child_container_ids), caption=post.caption)
            await db.commit()

        status = await client.container_status(post.container_id)
        if status in {"ERROR", "EXPIRED"}:
            await _fail(db, post, "Instagram couldn't process this file. Check that the link works and the format is supported (JPEG images; MP4/MOV video).")
            return post.status
        if status != "FINISHED":
            return await _maybe_timeout(db, post)

        post.ig_media_id = await client.publish_container(post.container_id)
        post.status, post.published_at = "published", utcnow()
        await db.commit()
    except GraphError as exc:
        if exc.is_transient and (post.attempts or 0) < MAX_ATTEMPTS:
            post.status, post.error = "scheduled", f"Retrying: {exc}"[:1000]  # try again on the next tick
            post.container_id, post.child_container_ids = None, []
            await db.commit()
            return post.status
        hint = " Reconnect Instagram to grant publishing permission." if exc.code in {10, 200, 190} else ""
        await _fail(db, post, f"{exc}{hint}")
        return post.status

    # After publishing: permalink and the optional first comment are best effort.
    try:
        media = await client.get_media(post.ig_media_id)
        post.permalink = media.get("permalink")
    except GraphError:
        pass
    if post.first_comment.strip() and post.kind != "story":
        try:
            await client.comment_on_media(post.ig_media_id, post.first_comment)
        except GraphError as exc:
            post.error = f"Published, but the first comment failed: {exc}"[:1000]
    await db.commit()
    await outbound_webhooks.emit(post.tenant_id, "post_published", {"post_id": str(post.id), "kind": post.kind, "media_id": post.ig_media_id, "permalink": post.permalink})
    return post.status


async def _maybe_timeout(db: AsyncSession, post: ScheduledPost) -> str:
    if post.updated_at and utcnow() - post.updated_at > PROCESSING_TIMEOUT and post.status == "processing":
        await _fail(db, post, "Instagram took too long to process the files. Try again, or use smaller files.")
    return post.status


async def run_due(limit: int = 10) -> int:
    """Scheduler job: start due posts and advance those still processing. Returns how many were published."""
    published = 0
    async with db_session.async_session_factory() as db:
        rows = (await db.execute(select(ScheduledPost).where(
            ((ScheduledPost.status == "scheduled") & (ScheduledPost.scheduled_at <= utcnow())) | (ScheduledPost.status == "processing")
        ).order_by(ScheduledPost.scheduled_at).limit(limit))).scalars().all()
        for post in rows:
            account = await db.get(InstagramAccount, post.account_id)
            if account is None or account.status != "connected":
                await _fail(db, post, "The Instagram account isn't connected.")
                continue
            try:
                published += (await step(db, post, account)) == "published"
            except Exception:  # noqa: BLE001 — one broken post must not stop the others
                log.exception("publishing post %s failed", post.id)
                await db.rollback()
    return published
