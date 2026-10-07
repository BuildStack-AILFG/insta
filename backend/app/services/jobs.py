"""
Durable webhook follow-up work. The webhook stores a `jobs` row next to the event, then runs it right away as a background task;
the scheduler sweeps anything that never started (deploy/restart between the 200 and the background task) so no reply is lost.

At-most-once: the automations send DMs/public replies part-way through, so a job that crashed mid-run is marked `failed`
(visible in the admin panel, retryable by hand) instead of being re-run blindly and messaging someone twice.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import session as db_session
from app.models.job import Job

log = logging.getLogger(__name__)

PICKUP_GRACE = timedelta(seconds=30)  # the webhook's own background task normally starts within milliseconds
STALE_RUNNING = timedelta(minutes=10)
KEEP_DONE = timedelta(days=7)
KEEP_FAILED = timedelta(days=30)
SWEEP_BATCH = 50


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _handlers() -> dict[str, Callable[[dict], Awaitable[None]]]:
    # Imported lazily: these modules import half the app, and the webhook module imports this one.
    from app.services.automation import dispatcher
    from app.services.instagram import comments, growth

    return {
        "dispatch_inbound": lambda p: dispatcher.dispatch_message(uuid.UUID(p["message_id"])),
        "run_comment": lambda p: comments.process_comment(uuid.UUID(p["comment_row_id"])),
        "run_ref": lambda p: growth.process_ref(uuid.UUID(p["account_id"]), p["ref"], uuid.UUID(p["conversation_id"])),
    }


def enqueue(db: AsyncSession, kind: str, payload: dict) -> Job:
    """Adds the job to the session; the caller commits."""
    job = Job(id=uuid.uuid4(), kind=kind, payload=payload, status="pending", attempts=0, run_after=utcnow())
    db.add(job)
    return job


async def _claim(db: AsyncSession, job_id: uuid.UUID) -> Job | None:
    """pending -> running in one statement, so two workers can never both run the same job."""
    row = (await db.execute(
        update(Job).where(Job.id == job_id, Job.status == "pending")
        .values(status="running", locked_at=utcnow(), attempts=Job.attempts + 1).returning(Job.kind, Job.payload)
    )).first()
    await db.commit()
    return row


async def _finish(job_id: uuid.UUID, status: str, error: str | None = None) -> None:
    async with db_session.async_session_factory() as db:
        await db.execute(update(Job).where(Job.id == job_id).values(status=status, last_error=error))
        await db.commit()


async def run(job_id: uuid.UUID) -> bool:
    """Runs one job if it is still pending. Never raises. Returns True if it ran successfully."""
    try:
        async with db_session.async_session_factory() as db:
            claimed = await _claim(db, job_id)
        if claimed is None:
            return False
        kind, payload = claimed
        handler = _handlers().get(kind)
        if handler is None:
            await _finish(job_id, "failed", f"Unknown job kind: {kind}")
            return False
        await handler(payload)
    except Exception as exc:  # noqa: BLE001
        log.exception("job %s failed", job_id)
        try:
            await _finish(job_id, "failed", f"{exc.__class__.__name__}: {exc}"[:2000])
        except Exception:  # noqa: BLE001
            log.exception("could not mark job %s failed", job_id)
        return False
    await _finish(job_id, "done")
    return True


async def sweep() -> dict[str, int]:
    """Scheduler pass: run pending jobs nobody picked up, fail jobs stuck in `running`, prune old rows."""
    now = utcnow()
    async with db_session.async_session_factory() as db:
        stuck = (await db.execute(
            update(Job).where(Job.status == "running", Job.locked_at < now - STALE_RUNNING)
            .values(status="failed", last_error="Interrupted while running (server restart?). Not retried automatically to avoid duplicate messages.")
            .returning(Job.id)
        )).scalars().all()
        await db.execute(delete(Job).where(Job.status == "done", Job.updated_at < now - KEEP_DONE))
        await db.execute(delete(Job).where(Job.status == "failed", Job.updated_at < now - KEEP_FAILED))
        await db.commit()
        due = (await db.execute(
            select(Job.id).where(Job.status == "pending", Job.run_after <= now - PICKUP_GRACE).order_by(Job.run_after).limit(SWEEP_BATCH)
        )).scalars().all()
    for job_id in stuck:
        log.warning("job %s was stuck in running and has been marked failed", job_id)
    recovered = 0
    for job_id in due:
        recovered += int(await run(job_id))
    return {"recovered": recovered, "stuck": len(stuck)}


async def retry(db: AsyncSession, job_id: uuid.UUID) -> bool:
    """Admin action: put a failed job back in the queue (the next scheduler pass runs it)."""
    res = await db.execute(update(Job).where(Job.id == job_id, Job.status == "failed")
                           .values(status="pending", run_after=utcnow() - PICKUP_GRACE, locked_at=None).returning(Job.id))
    await db.commit()
    return res.first() is not None
