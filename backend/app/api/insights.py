"""Instagram account and post insights (reach, views, engagement, followers, audience)."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db
from app.models.instagram_account import InstagramAccount
from app.services.instagram import insights as svc
from app.services.instagram.graph import GraphError

router = APIRouter(prefix="/insights", tags=["insights"])


async def _account(db: AsyncSession, ctx: Ctx, account_id: uuid.UUID) -> InstagramAccount:
    account = await db.get(InstagramAccount, account_id)
    if account is None or account.tenant_id != ctx.tenant_id or account.status == "disconnected":
        raise HTTPException(status_code=404, detail={"error": "Instagram account not found."})
    return account


def _graph_error(exc: GraphError) -> HTTPException:
    hint = " Reconnect Instagram to grant insights permission." if exc.code in {10, 200, 190} else ""
    return HTTPException(status_code=502, detail={"error": f"Instagram didn't return insights: {exc}.{hint}"})


@router.get("/account")
async def account_insights(account_id: uuid.UUID, days: int = Query(30), ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    if days not in (7, 14, 30):
        raise HTTPException(status_code=422, detail={"error": "days must be 7, 14 or 30."})
    account = await _account(db, ctx, account_id)
    try:
        return await svc.account_overview(account, days)
    except GraphError as exc:
        raise _graph_error(exc)


@router.get("/demographics")
async def audience(account_id: uuid.UUID, breakdown: Literal["country", "city", "age", "gender"] = "country",
                   ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    account = await _account(db, ctx, account_id)
    try:
        return {"breakdown": breakdown, "items": await svc.demographics(account, breakdown)}
    except GraphError as exc:
        raise _graph_error(exc)


@router.get("/media")
async def media_insights(account_id: uuid.UUID, limit: int = Query(12, ge=1, le=25), ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    account = await _account(db, ctx, account_id)
    try:
        return {"items": await svc.recent_media(account, limit)}
    except GraphError as exc:
        raise _graph_error(exc)
