"""Integrations: connect providers (management API) and receive their events (public hook endpoint)."""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_manager
from app.core import ratelimit
from app.core.crypto import CryptoError, decrypt_json, encrypt_json
from app.models.contact import Contact
from app.models.integration import Integration
from app.models.tenant import Tenant
from app.services.entitlements import require_feature
from app.services import integrations as reg
from app.services import payment_links, quotas, shiprocket

# Rows that belong to other features (the workspace's own Razorpay keys, Shiprocket) and never show as generic integrations.
INTERNAL = {payment_links.PROVIDER, shiprocket.PROVIDER}
from app.services.automation import events
from app.services.phone import InvalidPhone, normalize_phone
from app.services.instagram import messaging
from app.services.instagram.accounts import public_base

log = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations", tags=["integrations"], dependencies=[Depends(require_feature("integrations"))])
hooks = APIRouter(prefix="/hooks", tags=["hooks"])

MAX_HOOK_BODY = 512 * 1024


class IntegrationIn(BaseModel):
    secret: str | None = Field(default=None, max_length=500, description="Signing secret, or the Slack webhook URL for provider=slack. '' clears it.")
    events: list[str] = Field(default_factory=list, description="For notification integrations: which events to post")


def _out(i: Integration, base: str) -> dict:
    kind = reg.kind_of(i.provider)
    d = {"provider": i.provider, "kind": kind, "status": i.status, "config": {k: v for k, v in (i.config or {}).items()}, "has_secret": bool(i.credentials_enc),
         "last_event_at": i.last_event_at.isoformat() if i.last_event_at else None, "last_error": i.last_error, "connected_at": i.created_at.isoformat() if i.created_at else None}
    if kind != "slack":
        d["hook_url"] = f"{base}/api/hooks/{i.hook_token}"
    return d


@router.get("/adapters")
async def adapters(_: Ctx = Depends(get_ctx)) -> dict:
    return reg.META


@router.get("")
async def list_integrations(request: Request, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> list[dict]:
    base = public_base(str(request.base_url))
    rows = (await db.execute(select(Integration).where(Integration.tenant_id == ctx.tenant_id, Integration.provider.not_in(INTERNAL)).order_by(Integration.created_at))).scalars().all()
    return [_out(i, base) for i in rows]


@router.put("/{provider}")
async def upsert(provider: str, body: IntegrationIn, request: Request, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    if not reg.PROVIDER_RE.match(provider) or provider in INTERNAL:
        raise HTTPException(status_code=422, detail={"error": "Invalid integration id."})
    kind = reg.kind_of(provider)
    row = (await db.execute(select(Integration).where(Integration.tenant_id == ctx.tenant_id, Integration.provider == provider))).scalar_one_or_none()
    if row is None:
        count = (await db.execute(select(func.count()).select_from(Integration).where(Integration.tenant_id == ctx.tenant_id))).scalar_one()
        if count >= 40:
            raise HTTPException(status_code=409, detail={"error": "Too many integrations."})
        row = Integration(tenant_id=ctx.tenant_id, provider=provider, hook_token=secrets.token_urlsafe(24), config={})
        db.add(row)

    if kind == "slack":
        url = (body.secret or "").strip()
        if url:
            if not url.startswith("https://hooks.slack.com/"):
                raise HTTPException(status_code=422, detail={"error": "That doesn't look like a Slack incoming webhook URL (https://hooks.slack.com/…)."})
            row.credentials_enc = encrypt_json({"webhook_url": url})
        elif not row.credentials_enc:
            raise HTTPException(status_code=422, detail={"error": "Paste your Slack incoming webhook URL."})
        bad = [e for e in body.events if e not in reg.META["slack"]["events"]]
        if bad:
            raise HTTPException(status_code=422, detail={"error": f"Unknown event(s): {', '.join(bad)}."})
        row.config = {"events": body.events or reg.META["slack"]["events"]}
    else:
        if body.secret is not None:
            row.credentials_enc = encrypt_json({"secret": body.secret.strip()}) if body.secret.strip() else None
        row.config = {}
    row.status, row.last_error = "connected", None
    await db.commit()
    await db.refresh(row)
    return _out(row, public_base(str(request.base_url)))


@router.post("/{provider}/rotate-url")
async def rotate(provider: str, request: Request, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(Integration).where(Integration.tenant_id == ctx.tenant_id, Integration.provider == provider))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "Integration not connected."})
    row.hook_token = secrets.token_urlsafe(24)
    await db.commit()
    return _out(row, public_base(str(request.base_url)))


@router.post("/slack/test")
async def slack_test(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    row = (await db.execute(select(Integration).where(Integration.tenant_id == ctx.tenant_id, Integration.provider == "slack"))).scalar_one_or_none()
    if row is None or not row.credentials_enc:
        raise HTTPException(status_code=404, detail={"error": "Slack isn't connected."})
    ok, detail = await reg.post_slack(row.credentials_enc, "✅ GramForGrow is connected to this channel.")
    if not ok:
        raise HTTPException(status_code=502, detail={"error": f"Slack rejected the message: {detail}"})
    return {"ok": True}


@router.delete("/{provider}", status_code=204, response_model=None)
async def disconnect(provider: str, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    row = (await db.execute(select(Integration).where(Integration.tenant_id == ctx.tenant_id, Integration.provider == provider))).scalar_one_or_none()
    if row is not None:
        await db.delete(row)
        await db.commit()


# ---- public: receive provider events ---------------------------------------------------------------------------------------------------------

@hooks.post("/{token}")
async def receive(token: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    ratelimit.limit(request, "hook", 240, 60, token[:8])
    row = (await db.execute(select(Integration).where(Integration.hook_token == token))).scalar_one_or_none()
    if row is None or reg.kind_of(row.provider) in reg.NOTIFY or row.provider in INTERNAL:
        raise HTTPException(status_code=404, detail={"error": "Unknown hook."})
    raw = await request.body()
    if len(raw) > MAX_HOOK_BODY:
        raise HTTPException(status_code=413, detail={"error": "Payload too large."})
    kind = reg.kind_of(row.provider)
    secret = None
    if row.credentials_enc:
        try:
            secret = decrypt_json(row.credentials_enc).get("secret")
        except CryptoError:
            raise HTTPException(status_code=500, detail={"error": "Integration credentials unreadable — reconnect it."})
    try:
        reg.verify(kind, secret, raw, dict(request.headers))
    except reg.VerifyError as exc:
        row.last_error = str(exc)
        await db.commit()
        raise HTTPException(status_code=401, detail={"error": str(exc)})
    try:
        data = json.loads(raw or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": "Body must be JSON."})

    paid_link = kind == "razorpay" and isinstance(data, dict) and await payment_links.handle_webhook_event(db, row.tenant_id, data)
    tenant = await db.get(Tenant, row.tenant_id)
    cc = str((tenant.settings or {}).get("default_country_code", "")) if tenant else ""
    processed, ignored = [], 0
    for n in reg.PARSERS[kind](data, dict(request.headers)):
        try:
            phone = normalize_phone(n.phone, cc)
        except InvalidPhone:
            ignored += 1
            continue
        existing = (await messaging.upsert_contact_by_phone(db, row.tenant_id, phone, name=n.name, source=row.provider, email=n.email))
        contact, created = existing
        if created:
            total = (await db.execute(select(func.count()).select_from(Contact).where(Contact.tenant_id == row.tenant_id))).scalar_one()
            try:
                await quotas.enforce(db, row.tenant_id, "max_contacts", total - 1, label="contacts")
            except HTTPException:
                await db.rollback()
                ignored += 1
                continue
        if n.name and not created and contact.name.startswith("+"):
            contact.name = n.name
        if n.tags:
            contact.tags = sorted({*(contact.tags or []), *[t[:50] for t in n.tags]})[:50]
        if n.traits:
            contact.custom_fields = {**(contact.custom_fields or {}), **n.traits}
        processed.append(await events.process(db, row.tenant_id, contact, n.event, n.properties, row.provider))
    row.last_event_at, row.last_error = datetime.now(timezone.utc), None
    await db.commit()
    return {"ok": True, "processed": len(processed), "ignored": ignored, "payment_link_paid": bool(paid_link), "results": processed[:20]}
