"""Mobile push notifications through Expo's push service (Expo forwards to FCM/APNs, free, no keys on our side)."""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Callable

import httpx
from sqlalchemy import delete, select

from app.db import session as db_session
from app.models.device_token import DeviceToken

log = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
BATCH = 100  # Expo's per-request limit

_http_factory: Callable[[], httpx.AsyncClient] | None = None  # tests swap in a MockTransport client
_tasks: set[asyncio.Task] = set()


def notify(tenant_id: uuid.UUID, title: str, body: str, data: dict | None = None) -> None:
    """Fire-and-forget: push to every phone signed in to the workspace. Never blocks or fails the caller."""
    task = asyncio.create_task(_send_all(tenant_id, title, body, data or {}))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def drain() -> None:
    """Wait for in-flight pushes (used by tests and graceful shutdown)."""
    if _tasks:
        await asyncio.gather(*list(_tasks), return_exceptions=True)


async def _send_all(tenant_id: uuid.UUID, title: str, body: str, data: dict) -> None:
    try:
        async with db_session.async_session_factory() as db:
            tokens = list((await db.execute(select(DeviceToken.token).where(DeviceToken.tenant_id == tenant_id))).scalars())
            if not tokens:
                return
            dead: list[str] = []
            client = _http_factory() if _http_factory else httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0))
            try:
                for i in range(0, len(tokens), BATCH):
                    chunk = tokens[i:i + BATCH]
                    messages = [{"to": t, "title": title, "body": body[:180], "data": data, "sound": "default", "channelId": "default"} for t in chunk]
                    resp = await client.post(EXPO_PUSH_URL, json=messages, headers={"Accept": "application/json"})
                    resp.raise_for_status()
                    for token, ticket in zip(chunk, resp.json().get("data") or []):
                        if ticket.get("status") == "error" and (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                            dead.append(token)  # app uninstalled / token rotated
            finally:
                if _http_factory is None:
                    await client.aclose()
            if dead:
                await db.execute(delete(DeviceToken).where(DeviceToken.token.in_(dead)))
                await db.commit()
    except Exception:  # noqa: BLE001 — a push must never break the request path
        log.exception("push delivery failed for tenant %s", tenant_id)
