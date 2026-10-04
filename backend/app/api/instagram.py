"""Connect and manage Instagram professional accounts: OAuth login, token paste, refresh, posts, ice breakers."""

from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Ctx, get_ctx, get_current_user, get_db, is_platform_admin, require_manager
from app.core.config import get_settings
from app.models.conversation import Conversation
from app.models.instagram_account import InstagramAccount
from app.models.tenant import User
from app.services import quotas
from app.services.instagram import accounts as svc
from app.services.instagram import graph
from app.services.instagram.graph import GraphError

log = logging.getLogger(__name__)

router = APIRouter(prefix="/instagram", tags=["instagram"])


class OAuthFinish(BaseModel):
    code: str = Field(min_length=5, max_length=2000)
    state: str = Field(min_length=10, max_length=2000)


class ConnectToken(BaseModel):
    access_token: str = Field(min_length=20, max_length=2000)


class IceBreaker(BaseModel):
    question: str = Field(min_length=1, max_length=80)
    payload: str | None = Field(default=None, max_length=1000)


class AccountSettings(BaseModel):
    ice_breakers: list[IceBreaker] | None = Field(default=None, max_length=4)
    human_agent_tag: bool | None = None


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _out(a: InstagramAccount) -> dict:
    s = a.settings or {}
    return {
        "id": str(a.id), "ig_user_id": a.ig_user_id, "username": a.username, "name": a.name, "account_type": a.account_type,
        "profile_picture_url": a.profile_picture_url, "followers_count": a.followers_count, "media_count": a.media_count,
        "connection_type": a.connection_type, "status": a.status, "last_error": a.last_error, "webhooks_subscribed": a.webhooks_subscribed,
        "scopes": a.scopes or [], "token_expires_at": _iso(a.token_expires_at), "last_webhook_at": _iso(a.last_webhook_at),
        "last_synced_at": _iso(a.last_synced_at), "created_at": _iso(a.created_at),
        "ice_breakers": s.get("ice_breakers", []), "human_agent_tag": bool(s.get("human_agent_tag")),
    }


async def _owned(db: AsyncSession, ctx: Ctx, account_id: uuid.UUID) -> InstagramAccount:
    account = await db.get(InstagramAccount, account_id)
    if account is None or account.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Instagram account not found."})
    return account


async def _enforce_quota(db: AsyncSession, ctx: Ctx) -> None:
    count = (await db.execute(select(func.count()).select_from(InstagramAccount).where(
        InstagramAccount.tenant_id == ctx.tenant_id, InstagramAccount.status != "disconnected"))).scalar_one()
    await quotas.enforce(db, ctx.tenant_id, "max_instagram_accounts", count, label="Instagram accounts")


@router.get("/config")
async def instagram_config(request: Request, ctx: Ctx = Depends(get_ctx), user: User = Depends(get_current_user)) -> dict:
    s = get_settings()
    out = {"oauth_enabled": bool(s.instagram_app_id and s.instagram_app_secret)}
    # The Meta app is ours, not the customer's: its setup details are only for the people who run the platform.
    if is_platform_admin(user):
        out["setup"] = {
            "app_id_configured": bool(s.instagram_app_id),
            "app_secret_configured": bool(s.instagram_app_secret),
            "webhook_url": svc.webhook_url(svc.public_base(str(request.base_url))),
            "deauthorize_url": svc.deauthorize_url(svc.public_base(str(request.base_url))),
            "data_deletion_url": svc.data_deletion_url(svc.public_base(str(request.base_url))),
            "verify_token": s.webhook_verify_token,
            "redirect_uri": svc.redirect_uri(),
            "scopes": list(graph.SCOPES),
            "graph_version": s.graph_api_version,
        }
    return out


@router.get("/accounts")
async def list_accounts(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(InstagramAccount).where(InstagramAccount.tenant_id == ctx.tenant_id).order_by(InstagramAccount.created_at))).scalars().all()
    return [_out(a) for a in rows]


@router.get("/oauth/url")
async def oauth_url(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    s = get_settings()
    if not (s.instagram_app_id and s.instagram_app_secret):
        raise HTTPException(status_code=409, detail={"error": "Connecting with Instagram is temporarily unavailable. Please try again shortly or contact support.",
                                                     "code": "oauth_not_configured"})
    await _enforce_quota(db, ctx)
    return {"url": graph.authorize_url(svc.make_state(ctx.tenant_id, ctx.user_id), svc.redirect_uri())}


@router.post("/oauth/callback", status_code=status.HTTP_201_CREATED)
async def oauth_callback(body: OAuthFinish, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        svc.read_state(body.state, ctx.tenant_id, ctx.user_id)
    except svc.AccountError as exc:
        raise HTTPException(status_code=exc.status, detail={"error": exc.message})
    await _enforce_quota(db, ctx)
    try:
        account, warnings = await svc.connect_oauth(db, ctx.tenant_id, body.code)
    except svc.AccountError as exc:
        log.warning("Instagram connect failed for tenant %s: %s", ctx.tenant_id, exc.message)
        raise HTTPException(status_code=exc.status, detail={"error": exc.message})
    return {**_out(account), "warnings": warnings}


@router.post("/accounts", status_code=status.HTTP_201_CREATED)
async def connect_token(body: ConnectToken, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    await _enforce_quota(db, ctx)
    try:
        account, warnings = await svc.connect_manual(db, ctx.tenant_id, body.access_token)
    except svc.AccountError as exc:
        raise HTTPException(status_code=exc.status, detail={"error": exc.message})
    return {**_out(account), "warnings": warnings}


@router.post("/accounts/{account_id}/refresh")
async def refresh(account_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    account = await _owned(db, ctx, account_id)
    try:
        await svc.refresh_account(db, account)
    except GraphError as exc:
        raise HTTPException(status_code=502, detail={"error": f"Could not reach Instagram: {exc}"})
    return _out(account)


@router.patch("/accounts/{account_id}")
async def update_settings(account_id: uuid.UUID, body: AccountSettings, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    account = await _owned(db, ctx, account_id)
    settings = dict(account.settings or {})
    if body.ice_breakers is not None:
        questions = [{"question": q.question.strip(), "payload": (q.payload or q.question).strip()[:1000]} for q in body.ice_breakers if q.question.strip()]
        try:
            await svc.client_for(account).set_ice_breakers(questions)
        except GraphError as exc:
            raise HTTPException(status_code=502, detail={"error": f"Instagram rejected the ice breakers: {exc}"})
        settings["ice_breakers"] = questions
    if body.human_agent_tag is not None:
        settings["human_agent_tag"] = body.human_agent_tag
    account.settings = settings
    flag_modified(account, "settings")
    await db.commit()
    return _out(account)


@router.get("/accounts/{account_id}/media")
async def list_media(account_id: uuid.UUID, after: str | None = Query(None, max_length=500), limit: int = Query(24, ge=1, le=50),
                     ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    """Recent posts and reels, for picking which ones a comment automation watches."""
    account = await _owned(db, ctx, account_id)
    try:
        data = await svc.client_for(account).list_media(limit=limit, after=after)
    except GraphError as exc:
        raise HTTPException(status_code=502, detail={"error": f"Could not load posts from Instagram: {exc}"})
    items = [{
        "id": m.get("id"), "caption": m.get("caption"), "media_type": m.get("media_type"), "media_product_type": m.get("media_product_type"),
        "thumbnail_url": m.get("thumbnail_url") or m.get("media_url"), "permalink": m.get("permalink"), "timestamp": m.get("timestamp"),
        "comments_count": m.get("comments_count"), "like_count": m.get("like_count"),
    } for m in data.get("data", [])]
    cursors = (data.get("paging") or {}).get("cursors") or {}
    return {"items": items, "after": cursors.get("after") if (data.get("paging") or {}).get("next") else None}


@router.delete("/accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def disconnect(account_id: uuid.UUID, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    """Soft-disconnect: automations stop but conversation history is kept. Connecting the same account again re-enables it."""
    account = await _owned(db, ctx, account_id)
    try:
        await svc.client_for(account).unsubscribe_webhooks()
    except GraphError:
        pass  # token may already be revoked — disconnecting must still work
    has_history = (await db.execute(select(func.count()).select_from(Conversation).where(Conversation.account_id == account.id))).scalar_one()
    if has_history:
        account.status, account.webhooks_subscribed = "disconnected", False
    else:
        await db.delete(account)
    await db.commit()
