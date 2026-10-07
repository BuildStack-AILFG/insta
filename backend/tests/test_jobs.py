"""Durable webhook jobs: work survives a restart, never runs twice, and failures are visible and retryable."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.models.job import Job
from app.services import jobs
from tests.conftest import db_session
from tests.test_instagram import _create


async def _jobs(kind: str | None = None) -> list[Job]:
    async with await db_session() as db:
        q = select(Job).order_by(Job.created_at.desc())
        if kind:
            q = q.where(Job.kind == kind)
        return list((await db.execute(q)).scalars().all())


async def _set(job_id: uuid.UUID, **values) -> None:
    async with await db_session() as db:
        await db.execute(update(Job).where(Job.id == job_id).values(**values))
        await db.commit()


async def test_webhook_comment_runs_as_a_job(wsa, meta):
    await _create(wsa)
    r = await wsa.comment("price please", from_="900000000701", comment_id="17900000000070001")
    assert r.status_code == 200
    job = (await _jobs("run_comment"))[0]
    assert job.status == "done" and job.attempts == 1 and job.last_error is None
    assert len(meta.comment_replies) == 1 and len(meta.sent) == 1


async def test_job_lost_to_a_restart_is_recovered_by_the_sweep(wsa, meta, monkeypatch):
    await _create(wsa)
    with monkeypatch.context() as m:
        async def never_started(_job_id):  # the process died between the 200 and the background task
            return False
        m.setattr(jobs, "run", never_started)
        await wsa.comment("price?", from_="900000000702", comment_id="17900000000070002")
    job = (await _jobs("run_comment"))[0]
    assert job.status == "pending" and meta.sent == []

    assert (await jobs.sweep())["recovered"] == 0  # still inside the pickup grace period
    await _set(job.id, run_after=datetime.now(timezone.utc) - timedelta(minutes=1))
    assert (await jobs.sweep())["recovered"] >= 1
    assert len(meta.sent) == 1 and (await _jobs("run_comment"))[0].status == "done"


async def test_a_job_never_runs_twice(wsa, meta):
    await _create(wsa)
    await wsa.comment("link", from_="900000000703", comment_id="17900000000070003")
    job = (await _jobs("run_comment"))[0]
    assert await jobs.run(job.id) is False  # already done: the claim fails

    # Even if the row is forced back to pending, the comment itself is only handled once.
    await _set(job.id, status="pending")
    assert await jobs.run(job.id) is True
    assert len(meta.sent) == 1 and len(meta.comment_replies) == 1


async def test_crash_marks_failed_and_admin_retry_requeues(wsa, monkeypatch):
    async with await db_session() as db:
        job = jobs.enqueue(db, "dispatch_inbound", {"message_id": str(uuid.uuid4())})
        await db.commit()

    async def boom(_message_id):
        raise RuntimeError("db went away")
    monkeypatch.setattr("app.services.automation.dispatcher.dispatch_message", boom)
    assert await jobs.run(job.id) is False
    failed = next(j for j in await _jobs() if j.id == job.id)
    assert failed.status == "failed" and "db went away" in failed.last_error

    monkeypatch.undo()
    async with await db_session() as db:
        assert await jobs.retry(db, job.id) is True
        assert await jobs.retry(db, job.id) is False  # only failed jobs
    assert (await jobs.sweep())["recovered"] >= 1  # unknown message id -> handler returns quietly -> done
    assert next(j for j in await _jobs() if j.id == job.id).status == "done"


async def test_job_stuck_in_running_is_failed_not_rerun(wsa):
    async with await db_session() as db:
        job = jobs.enqueue(db, "dispatch_inbound", {"message_id": str(uuid.uuid4())})
        await db.commit()
    await _set(job.id, status="running", locked_at=datetime.now(timezone.utc) - timedelta(hours=1))
    assert (await jobs.sweep())["stuck"] >= 1
    stuck = next(j for j in await _jobs() if j.id == job.id)
    assert stuck.status == "failed" and "Interrupted" in stuck.last_error
