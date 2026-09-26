"""Developer settings: API keys and outbound (signed) webhooks."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_manager
from app.core.crypto import decrypt, encrypt
from app.core.net import UnsafeUrl, assert_public_url
from app.models.integration import ApiKey, OutboundWebhook
from app.services.entitlements import require_feature
from app.services import outbound_webhooks

router = APIRouter(prefix="/developer", tags=["developer"], dependencies=[Depends(require_feature("api_access"))])

KEY_PREFIX = "lfg_live_"


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


class KeyIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


def _key_out(k: ApiKey) -> dict:
    return {"id": str(k.id), "name": k.name, "prefix": k.prefix, "created_at": k.created_at.isoformat() if k.created_at else None,
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None, "revoked": k.revoked_at is not None}


@router.get("/keys")
async def list_keys(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(ApiKey).where(ApiKey.tenant_id == ctx.tenant_id).order_by(ApiKey.created_at.desc()))).scalars().all()
    return [_key_out(k) for k in rows]


@router.post("/keys", status_code=status.HTTP_201_CREATED)
async def create_key(body: KeyIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    active = (await db.execute(select(ApiKey).where(ApiKey.tenant_id == ctx.tenant_id, ApiKey.revoked_at.is_(None)))).scalars().all()
    if len(active) >= 10:
        raise HTTPException(status_code=409, detail={"error": "You can have at most 10 active API keys. Revoke one first."})
    key = KEY_PREFIX + secrets.token_urlsafe(32)
    row = ApiKey(tenant_id=ctx.tenant_id, name=body.name.strip(), prefix=key[:14], key_hash=hash_key(key))
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {**_key_out(row), "key": key, "note": "Copy this key now — it won't be shown again."}


@router.delete("/keys/{key_id}", status_code=204, response_model=None)
async def revoke_key(key_id: uuid.UUID, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    k = await db.get(ApiKey, key_id)
    if k is None or k.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "API key not found."})
    k.revoked_at = datetime.now(timezone.utc)
    await db.commit()


# ---- outbound webhooks -----------------------------------------------------------------------------------------------

class WebhookIn(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    events: list[str] = Field(default_factory=list, max_length=30)
    enabled: bool = True


def _hook_out(h: OutboundWebhook) -> dict:
    return {"id": str(h.id), "url": h.url, "events": h.events or [], "enabled": h.enabled, "failure_count": h.failure_count, "last_status": h.last_status,
            "last_delivery_at": h.last_delivery_at.isoformat() if h.last_delivery_at else None, "created_at": h.created_at.isoformat() if h.created_at else None}


def _validate(body: WebhookIn) -> None:
    try:
        assert_public_url(body.url.strip())
    except UnsafeUrl as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)})
    bad = [e for e in body.events if e not in outbound_webhooks.EVENTS]
    if bad:
        raise HTTPException(status_code=422, detail={"error": f"Unknown event(s): {', '.join(bad)}."})


@router.get("/webhook-events")
async def webhook_events(_: Ctx = Depends(get_ctx)) -> list[str]:
    return outbound_webhooks.EVENTS


@router.get("/webhooks")
async def list_webhooks(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(OutboundWebhook).where(OutboundWebhook.tenant_id == ctx.tenant_id).order_by(OutboundWebhook.created_at.desc()))).scalars().all()
    return [_hook_out(h) for h in rows]


@router.post("/webhooks", status_code=status.HTTP_201_CREATED)
async def create_webhook(body: WebhookIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    _validate(body)
    count = len((await db.execute(select(OutboundWebhook.id).where(OutboundWebhook.tenant_id == ctx.tenant_id))).all())
    if count >= 10:
        raise HTTPException(status_code=409, detail={"error": "You can register at most 10 webhooks."})
    secret = "whsec_" + secrets.token_urlsafe(24)
    h = OutboundWebhook(tenant_id=ctx.tenant_id, url=body.url.strip(), events=body.events, enabled=body.enabled, secret_enc=encrypt(secret))
    db.add(h)
    await db.commit()
    await db.refresh(h)
    return {**_hook_out(h), "secret": secret}


@router.put("/webhooks/{hook_id}")
async def update_webhook(hook_id: uuid.UUID, body: WebhookIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    h = await db.get(OutboundWebhook, hook_id)
    if h is None or h.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Webhook not found."})
    _validate(body)
    h.url, h.events, h.enabled = body.url.strip(), body.events, body.enabled
    if body.enabled:
        h.failure_count = 0
    await db.commit()
    await db.refresh(h)
    return _hook_out(h)


@router.get("/webhooks/{hook_id}/secret")
async def reveal_secret(hook_id: uuid.UUID, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    h = await db.get(OutboundWebhook, hook_id)
    if h is None or h.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Webhook not found."})
    return {"secret": decrypt(h.secret_enc)}


@router.post("/webhooks/{hook_id}/test")
async def test_webhook(hook_id: uuid.UUID, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    h = await db.get(OutboundWebhook, hook_id)
    if h is None or h.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Webhook not found."})
    ok, detail = await outbound_webhooks.send_test(h)
    return {"ok": ok, "detail": detail}


@router.delete("/webhooks/{hook_id}", status_code=204, response_model=None)
async def delete_webhook(hook_id: uuid.UUID, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    h = await db.get(OutboundWebhook, hook_id)
    if h is None or h.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Webhook not found."})
    await db.delete(h)
    await db.commit()
