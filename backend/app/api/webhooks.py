"""Public webhook endpoint Meta calls for Instagram. No auth header — authenticity is proven by the X-Hub-Signature-256 HMAC."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from urllib.parse import parse_qs

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import get_settings
from app.models.instagram_account import InstagramAccount
from app.services.automation import dispatcher
from app.services.instagram import comments, growth, inbound

log = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])
MAX_BODY = 2 * 1024 * 1024


@router.get("/instagram")
async def verify(hub_mode: str | None = Query(None, alias="hub.mode"), hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
                 hub_challenge: str | None = Query(None, alias="hub.challenge")) -> PlainTextResponse:
    expected = get_settings().webhook_verify_token
    if hub_mode == "subscribe" and expected and hub_verify_token and hmac.compare_digest(hub_verify_token, expected):
        return PlainTextResponse(hub_challenge or "")
    raise HTTPException(status_code=403, detail={"error": "Webhook verification failed."})


@router.post("/instagram")
async def receive(request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db)) -> dict:
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(status_code=413, detail={"error": "Payload too large."})
    if not inbound.verify_signature(raw, request.headers.get("x-hub-signature-256"), get_settings().instagram_app_secret):
        # Never process unsigned/forged events. (No secret configured also lands here — fail closed.)
        raise HTTPException(status_code=401, detail={"error": "Invalid signature."})
    try:
        payload = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": "Invalid JSON."})
    if payload.get("object") != "instagram":
        return {"ok": True, "ignored": True}

    result = await inbound.ingest(db, payload)
    # Automation makes Graph calls and can be slow — never make Meta wait on it.
    for message_id in result.dispatch:
        background.add_task(dispatcher.dispatch_inbound, message_id)
    for comment_row_id in result.comments:
        background.add_task(comments.run_comment, comment_row_id)
    for account_id, ref, conversation_id in result.referrals:
        background.add_task(growth.run_ref, account_id, ref, conversation_id)
    return {"ok": True, "messages": result.messages, "comments": len(result.comments), "duplicates": result.duplicates}


# ---- Meta "Business login settings": deauthorize callback + data deletion request ---------------------------------------
# Meta POSTs a form field `signed_request` = base64url(HMAC-SHA256(payload, app_secret)) + "." + base64url(json payload).

def _b64decode(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def parse_signed_request(signed_request: str, secret: str) -> dict | None:
    try:
        sig_part, payload_part = signed_request.split(".", 1)
        sig, data = _b64decode(sig_part), json.loads(_b64decode(payload_part))
    except (ValueError, TypeError):
        return None
    if not secret or str(data.get("algorithm", "")).upper() != "HMAC-SHA256":
        return None
    expected = hmac.new(secret.encode(), payload_part.encode(), hashlib.sha256).digest()
    return data if hmac.compare_digest(sig, expected) else None


async def _signed_user_id(request: Request) -> str:
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(status_code=413, detail={"error": "Payload too large."})
    signed = (parse_qs(raw.decode(errors="replace")).get("signed_request") or [""])[0]
    data = parse_signed_request(signed, get_settings().instagram_app_secret)
    if data is None or not data.get("user_id"):
        raise HTTPException(status_code=400, detail={"error": "Invalid signed_request."})
    return str(data["user_id"])


async def _accounts_for(db: AsyncSession, user_id: str) -> list[InstagramAccount]:
    # Meta may send either the Instagram-scoped id or the professional account id, so match both.
    q = select(InstagramAccount).where(or_(InstagramAccount.ig_user_id == user_id, InstagramAccount.app_scoped_id == user_id))
    return list((await db.execute(q)).scalars().all())


@router.post("/instagram/deauthorize")
async def deauthorize(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """The person removed our app from their Instagram account: drop the token and stop all automation for it."""
    user_id = await _signed_user_id(request)
    for account in await _accounts_for(db, user_id):
        account.status, account.webhooks_subscribed = "disconnected", False
        account.access_token_enc, account.token_expires_at = "", None
        account.last_error = "Access was removed from Instagram — reconnect to resume."
    await db.commit()
    return {"ok": True}


def deletion_code(user_id: str) -> str:
    return hmac.new(get_settings().jwt_secret.encode(), f"ig-data-deletion:{user_id}".encode(), hashlib.sha256).hexdigest()[:16]


@router.post("/instagram/data-deletion")
async def data_deletion(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Delete everything we hold for this Instagram account (conversations, contacts' threads, automations cascade with it)."""
    user_id = await _signed_user_id(request)
    for account in await _accounts_for(db, user_id):
        await db.delete(account)
    await db.commit()
    code = deletion_code(user_id)
    return {"url": f"{get_settings().frontend_url.rstrip('/')}/data-deletion?code={code}", "confirmation_code": code}
