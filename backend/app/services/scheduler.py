"""
Background jobs, run in-process (lib/PHASES.md: no Celery/Redis until a trigger fires). One instance is elected leader with a
Postgres advisory lock, so running two API replicas never double-resumes a flow or double-sends a delayed reply.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, exists, select, text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.config import get_settings
from app.db import session as db_session
from app.models.conversation import Conversation, Message
from app.models.tenant import Tenant
from app.models.webhook import WebhookIngress
from app.models.instagram_account import InstagramAccount
from app.services import billing, payment_links
from app.services.automation import dispatcher, flow_engine
from app.services.instagram import accounts as ig_accounts
from app.services.instagram import growth, publishing
from app.services.instagram import messaging
from app.services.instagram.graph import GraphError

log = logging.getLogger(__name__)

LOCK_KEY = 7_262_026_001
ACCOUNT_REFRESH_EVERY = timedelta(minutes=60)
INGRESS_RETENTION = timedelta(days=30)

_task: asyncio.Task | None = None
_stop = asyncio.Event()
_last_cleanup: datetime | None = None
_last_billing: datetime | None = None
BILLING_EVERY = timedelta(minutes=30)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def tick() -> dict[str, int]:
    """One pass over every job. Exposed separately so tests (and an admin endpoint) can run it deterministically."""
    stats = {"flows": 0, "delayed_replies": 0, "accounts": 0, "tokens_refreshed": 0, "payment_links": 0, "posts_published": 0}

    async with db_session.async_session_factory() as db:
        due = await flow_engine.due_executions(db)
        for ex in due:
            try:
                await flow_engine.resume_timed(db, ex)
                stats["flows"] += 1
            except Exception:  # noqa: BLE001
                log.exception("resuming execution %s failed", ex.id)
                await db.rollback()

    try:
        stats["posts_published"] = await publishing.run_due()
    except Exception:  # noqa: BLE001
        log.exception("publishing scheduled posts failed")
    try:
        stats["click_reminders"] = await growth.run_reminders()
    except Exception:  # noqa: BLE001
        log.exception("click reminders failed")
    stats["delayed_replies"] = await _send_delayed_replies()
    stats["accounts"], stats["tokens_refreshed"] = await _refresh_accounts()
    stats["payment_links"] = await payment_links.poll_open_links()
    await _billing_housekeeping()
    await _cleanup()
    return stats


async def _send_delayed_replies() -> int:
    """'Delayed reply': nobody answered within N minutes -> send the workspace's holding message once per inbound burst."""
    sent = 0
    async with db_session.async_session_factory() as db:
        tenants = (await db.execute(select(Tenant).where(Tenant.settings["auto_replies"]["delayed"]["enabled"].as_boolean().is_(True)))).scalars().all()
        for tenant in tenants:
            cfg = tenant.settings["auto_replies"]["delayed"]
            message = (cfg.get("message") or "").strip()
            if not message:
                continue
            minutes = max(1, min(int(cfg.get("minutes") or 5), 1440))
            now = utcnow()
            answered = exists().where(Message.conversation_id == Conversation.id, Message.direction == "out", Message.created_at >= Conversation.last_inbound_at)
            convs = (await db.execute(select(Conversation).where(
                Conversation.tenant_id == tenant.id, Conversation.status == "open", Conversation.inbox_status == "bot", Conversation.unread_count > 0,
                Conversation.last_inbound_at <= now - timedelta(minutes=minutes), Conversation.last_inbound_at > now - messaging.WINDOW, ~answered,
            ).limit(50))).scalars().all()
            for conv in convs:
                account = await db.get(InstagramAccount, conv.account_id)
                contact = await db.get(dispatcher.Contact, conv.contact_id)
                if account and contact and account.status == "connected":
                    await dispatcher._bot_text(db, account, conv, contact, message, "delayed")
                    sent += 1
    return sent


async def _refresh_accounts() -> tuple[int, int]:
    """Hourly: refresh profile/follower counts, retry webhook subscription, and extend access tokens before they expire."""
    done = refreshed = 0
    async with db_session.async_session_factory() as db:
        stale = (await db.execute(select(InstagramAccount).where(
            InstagramAccount.status == "connected", (InstagramAccount.last_synced_at.is_(None)) | (InstagramAccount.last_synced_at < utcnow() - ACCOUNT_REFRESH_EVERY)
        ).limit(5))).scalars().all()
        for account in stale:
            try:
                refreshed += int(await ig_accounts.refresh_token_if_due(db, account))
                await ig_accounts.refresh_account(db, account)
                done += 1
            except GraphError as exc:
                log.warning("periodic refresh failed for account %s: %s", account.id, exc)
                account.last_synced_at = utcnow()  # back off instead of retrying every tick
                await db.commit()
    return done, refreshed


async def _billing_housekeeping() -> None:
    """Every 30 minutes: end lapsed trials/plans and send renewal reminders."""
    global _last_billing
    if _last_billing and utcnow() - _last_billing < BILLING_EVERY:
        return
    _last_billing = utcnow()
    try:
        await billing.housekeeping()
    except Exception:  # noqa: BLE001
        log.exception("billing housekeeping failed")


async def _cleanup() -> None:
    global _last_cleanup
    if _last_cleanup and utcnow() - _last_cleanup < timedelta(hours=6):
        return
    _last_cleanup = utcnow()
    async with db_session.async_session_factory() as db:
        await db.execute(delete(WebhookIngress).where(WebhookIngress.created_at < utcnow() - INGRESS_RETENTION))
        await db.commit()


async def _acquire_leader(conn: AsyncConnection) -> bool:
    return bool((await conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": LOCK_KEY})).scalar())


async def _loop() -> None:
    interval = get_settings().scheduler_interval_seconds
    conn: AsyncConnection | None = None
    leader = False
    while not _stop.is_set():
        try:
            if conn is None or conn.closed:
                conn = await db_session.engine.connect()
                leader = False
            if not leader:
                leader = await _acquire_leader(conn)
                if leader:
                    log.info("scheduler: this instance is the leader")
            else:
                await conn.execute(text("SELECT 1"))  # detect a dropped connection (which would silently release the lock)
            if leader:
                await tick()
        except Exception:  # noqa: BLE001 — the loop must survive anything
            log.exception("scheduler tick failed")
            leader = False
            if conn is not None:
                try:
                    await conn.close()
                except Exception:  # noqa: BLE001
                    pass
                conn = None
        try:
            await asyncio.wait_for(_stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass
    if conn is not None:
        await conn.close()


def start() -> None:
    global _task
    if not get_settings().scheduler_enabled or _task is not None:
        return
    _stop.clear()
    _task = asyncio.create_task(_loop(), name="scheduler")


async def stop() -> None:
    global _task
    _stop.set()
    if _task is not None:
        await _task
        _task = None
