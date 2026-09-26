"""Giveaways: pick random winners from a post's comments, then DM them."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.models.comment_automation import Giveaway
from app.models.instagram_account import InstagramAccount
from app.services.instagram import giveaways as svc

router = APIRouter(prefix="/giveaways", tags=["giveaways"])


class GiveawayIn(BaseModel):
    account_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    media_id: str = Field(min_length=1, max_length=64)
    media_preview: dict = Field(default_factory=dict)
    keyword: str = Field(default="", max_length=60)
    min_mentions: int = Field(default=0, ge=0, le=10)
    unique_users: bool = True
    exclude_usernames: list[str] = Field(default_factory=list, max_length=200)
    winners_count: int = Field(default=1, ge=1, le=50)

    @field_validator("exclude_usernames")
    @classmethod
    def _names(cls, v: list[str]) -> list[str]:
        return sorted({x.strip().lstrip("@")[:100] for x in v if x.strip()})


class NotifyIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _out(g: Giveaway, username: str | None = None) -> dict:
    return {
        "id": str(g.id), "account_id": str(g.account_id), "account_username": username, "name": g.name, "media_id": g.media_id, "media_preview": g.media_preview or {},
        "keyword": g.keyword, "min_mentions": g.min_mentions, "unique_users": g.unique_users, "exclude_usernames": g.exclude_usernames or [],
        "winners_count": g.winners_count, "status": g.status, "comments_total": g.comments_total, "entries_count": g.entries_count,
        "winners": g.winners or [], "drawn_at": _iso(g.drawn_at), "notify_message": g.notify_message, "notified_at": _iso(g.notified_at),
        "created_at": _iso(g.created_at),
    }


async def _owned(db: AsyncSession, ctx: Ctx, gid: uuid.UUID) -> tuple[Giveaway, InstagramAccount]:
    g = await db.get(Giveaway, gid)
    if g is None or g.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Giveaway not found."})
    account = await db.get(InstagramAccount, g.account_id)
    if account is None or account.status == "disconnected":
        raise HTTPException(status_code=409, detail={"error": "Reconnect this giveaway's Instagram account first."})
    return g, account


@router.get("")
async def list_giveaways(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(Giveaway, InstagramAccount.username).join(InstagramAccount, InstagramAccount.id == Giveaway.account_id)
                             .where(Giveaway.tenant_id == ctx.tenant_id).order_by(Giveaway.created_at.desc()))).all()
    return [_out(g, u) for g, u in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(body: GiveawayIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    account = await db.get(InstagramAccount, body.account_id)
    if account is None or account.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=422, detail={"error": "Choose one of your connected Instagram accounts."})
    g = Giveaway(tenant_id=ctx.tenant_id, **body.model_dump(), winners=[])
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return _out(g, account.username)


@router.put("/{gid}")
async def update(gid: uuid.UUID, body: GiveawayIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    g, account = await _owned(db, ctx, gid)
    for k, v in body.model_dump().items():
        setattr(g, k, v)
    await db.commit()
    await db.refresh(g)
    return _out(g, account.username)


@router.post("/{gid}/draw")
async def draw(gid: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    """Pick winners now. Drawing again re-picks from the current comments (the previous winners are replaced)."""
    g, account = await _owned(db, ctx, gid)
    try:
        await svc.draw(db, g, account)
    except svc.GiveawayError as exc:
        raise HTTPException(status_code=exc.status, detail={"error": exc.message})
    return _out(g, account.username)


@router.post("/{gid}/notify")
async def notify(gid: uuid.UUID, body: NotifyIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    g, account = await _owned(db, ctx, gid)
    if g.status != "drawn" or not g.winners:
        raise HTTPException(status_code=409, detail={"error": "Draw the winners first."})
    await svc.notify(db, g, account, body.message)
    return _out(g, account.username)


@router.delete("/{gid}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete(gid: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    g = await db.get(Giveaway, gid)
    if g is None or g.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Giveaway not found."})
    await db.delete(g)
    await db.commit()
