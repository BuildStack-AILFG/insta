"""Customer-facing webhooks: signed event delivery to URLs a workspace registers (Zapier/Make/n8n/custom backends)."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone

import httpx
from sqlalchemy import select

from app.core.crypto import CryptoError, decrypt
from app.core.net import UnsafeUrl, assert_public_url
from app.db import session as db_session
from app.models.integration import Integration, OutboundWebhook
from app.services import integrations

log = logging.getLogger(__name__)

EVENTS = [
    "message_received", "message_sent", "message_failed",
    "conversation_created", "contact_created", "contact_opted_out", "comment_automation_triggered",
    "flow_completed", "lead_captured", "link_clicked", "comment_moderated", "giveaway_drawn", "post_published", "post_failed",
    "deal_created", "deal_stage_changed", "deal_won", "deal_lost", "payment_received",
]
MAX_FAILURES = 5

_tasks: set[asyncio.Task] = set()


def sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


async def emit(tenant_id: uuid.UUID, event: str, data: dict) -> None:
    """Fire-and-forget: never blocks or fails the caller."""
    task = asyncio.create_task(_deliver_all(tenant_id, event, data))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def drain() -> None:
    """Wait for in-flight deliveries (used by tests and graceful shutdown)."""
    if _tasks:
        await asyncio.gather(*list(_tasks), return_exceptions=True)


async def _deliver_all(tenant_id: uuid.UUID, event: str, data: dict) -> None:
    try:
        async with db_session.async_session_factory() as db:
            hooks = (await db.execute(select(OutboundWebhook).where(OutboundWebhook.tenant_id == tenant_id, OutboundWebhook.enabled.is_(True)))).scalars().all()
            hooks = [h for h in hooks if not h.events or event in h.events]
            await _notify_slack(db, tenant_id, event, data)
            if not hooks:
                return
            envelope = {"version": "1.0", "timestamp": datetime.now(timezone.utc).isoformat(), "type": event, "data": data}
            body = json.dumps(envelope, separators=(",", ":"), default=str).encode()
            for hook in hooks:
                await _deliver(db, hook, event, body)
            await db.commit()
    except Exception:  # noqa: BLE001 — webhooks must never break the request path
        log.exception("outbound webhook delivery crashed")


async def _notify_slack(db, tenant_id: uuid.UUID, event: str, data: dict) -> None:
    render = integrations.SLACK_TEXT.get(event)
    if render is None:
        return
    row = (await db.execute(select(Integration).where(Integration.tenant_id == tenant_id, Integration.provider == "slack", Integration.status == "connected"))).scalar_one_or_none()
    if row is None or not row.credentials_enc or event not in (row.config or {}).get("events", []):
        return
    ok, detail = await integrations.post_slack(row.credentials_enc, render(data))
    row.last_error = None if ok else f"Slack: {detail}"


async def _deliver(db, hook: OutboundWebhook, event: str, body: bytes) -> tuple[bool, str]:
    try:
        assert_public_url(hook.url)
        secret = decrypt(hook.secret_enc)
        async with httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=4.0), follow_redirects=False) as http:
            resp = await http.post(hook.url, content=body, headers={
                "Content-Type": "application/json", "X-LFG-Event": event, "X-LFG-Signature": sign(secret, body), "User-Agent": "DMForGrow-Webhooks/1.0",
            })
        ok, status = 200 <= resp.status_code < 300, f"HTTP {resp.status_code}"
    except (httpx.HTTPError, UnsafeUrl, CryptoError) as exc:
        ok, status = False, f"{exc.__class__.__name__}: {exc}"[:200]
    hook.last_status = status
    hook.last_delivery_at = datetime.now(timezone.utc)
    if ok:
        hook.failure_count = 0
    else:
        hook.failure_count += 1
        if hook.failure_count >= MAX_FAILURES:
            hook.enabled = False  # auto-disable a dead endpoint instead of hammering it forever
            log.warning("disabled webhook %s after %s consecutive failures", hook.id, hook.failure_count)
    return ok, status


async def send_test(hook: OutboundWebhook) -> tuple[bool, str]:
    body = json.dumps({"version": "1.0", "timestamp": datetime.now(timezone.utc).isoformat(), "type": "ping", "data": {"message": "Test event from DMForGrow"}}).encode()
    async with db_session.async_session_factory() as db:
        fresh = await db.get(OutboundWebhook, hook.id)
        result = await _deliver(db, fresh, "ping", body)
        await db.commit()
    return result
