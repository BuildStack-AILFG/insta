"""Saved audience segments."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.models.segment import Segment
from app.services import segments as svc

router = APIRouter(prefix="/segments", tags=["segments"])


class RuleIn(BaseModel):
    field: str = Field(min_length=1, max_length=100)
    op: str = "eq"
    value: str | int | float | bool | None = None


class FiltersIn(BaseModel):
    match: str = Field(default="all", pattern="^(all|any)$")
    rules: list[RuleIn] = Field(default_factory=list, max_length=20)


class SegmentIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    filters: FiltersIn


async def _out(db: AsyncSession, s: Segment) -> dict:
    try:
        count = await svc.count_matching(db, s.tenant_id, s.filters)
    except svc.SegmentError:
        count = 0
    return {"id": str(s.id), "name": s.name, "filters": s.filters, "count": count, "created_at": s.created_at.isoformat() if s.created_at else None}


async def _owned(db: AsyncSession, ctx: Ctx, segment_id: uuid.UUID) -> Segment:
    s = await db.get(Segment, segment_id)
    if s is None or s.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Segment not found."})
    return s


def _validated(body: SegmentIn) -> dict:
    filters = body.filters.model_dump()
    try:
        svc.validate_filters(filters)
    except svc.SegmentError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)})
    return filters


@router.get("")
async def list_segments(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(Segment).where(Segment.tenant_id == ctx.tenant_id).order_by(Segment.created_at.desc()))).scalars().all()
    return [await _out(db, s) for s in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_segment(body: SegmentIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    s = Segment(tenant_id=ctx.tenant_id, name=body.name.strip(), filters=_validated(body))
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return await _out(db, s)


@router.put("/{segment_id}")
async def update_segment(segment_id: uuid.UUID, body: SegmentIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    s = await _owned(db, ctx, segment_id)
    s.name, s.filters = body.name.strip(), _validated(body)
    await db.commit()
    return await _out(db, s)


@router.post("/preview")
async def preview(body: FiltersIn, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    filters = body.model_dump()
    try:
        svc.validate_filters(filters)
        return {"count": await svc.count_matching(db, ctx.tenant_id, filters)}
    except svc.SegmentError as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)})


@router.delete("/{segment_id}", status_code=204, response_model=None)
async def delete_segment(segment_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    await db.delete(await _owned(db, ctx, segment_id))
    await db.commit()
