"""Public webhook endpoint Meta calls for Instagram. No auth header — authenticity is proven by the X-Hub-Signature-256 HMAC."""

from __future__ import annotations

import hmac
import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import get_settings
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
