"""Sales pipeline API: kanban board, deals, stages and reports."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_manager, require_writer
from app.services.entitlements import require_feature
from app.services import pipeline as svc

router = APIRouter(prefix="/pipeline", tags=["pipeline"])


def _http(exc: svc.PipelineError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail={"error": exc.message})


class StageIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    color: str = "#64748b"
    kind: str = "open"
    probability: int = Field(default=0, ge=0, le=100)


class StagePatch(BaseModel):
    name: str | None = Field(default=None, max_length=80)
    color: str | None = None
    kind: str | None = None
    probability: int | None = Field(default=None, ge=0, le=100)


class OrderIn(BaseModel):
    ids: list[uuid.UUID]


class DealIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    stage_id: uuid.UUID | None = None
    contact_id: uuid.UUID | None = None
    value: int = Field(default=0, ge=0, le=10**12, description="Smallest currency unit (paise)")
    currency: str = "INR"
    owner_user_id: uuid.UUID | None = None
    expected_close: date | None = None
    notes: str | None = Field(default=None, max_length=5000)


class DealPatch(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    value: int | None = Field(default=None, ge=0, le=10**12)
    currency: str | None = None
    contact_id: uuid.UUID | None = None
    owner_user_id: uuid.UUID | None = None
    expected_close: date | None = None
    notes: str | None = Field(default=None, max_length=5000)
    lost_reason: str | None = Field(default=None, max_length=200)


class MoveIn(BaseModel):
    stage_id: uuid.UUID
    position: int | None = Field(default=None, ge=0)
    lost_reason: str | None = Field(default=None, max_length=200)


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


# ---- stages ---------------------------------------------------------------------------------------------------------

@router.get("/stages")
async def stages(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    return [svc.stage_out(s) for s in await svc.ensure_stages(db, ctx.tenant_id)]


@router.post("/stages", status_code=201)
async def add_stage(body: StageIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return svc.stage_out(await svc.add_stage(db, ctx.tenant_id, name=body.name, color=body.color, kind=body.kind, probability=body.probability))
    except svc.PipelineError as exc:
        raise _http(exc)


@router.put("/stages/order")
async def reorder(body: OrderIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> list[dict]:
    try:
        return [svc.stage_out(s) for s in await svc.reorder_stages(db, ctx.tenant_id, body.ids)]
    except svc.PipelineError as exc:
        raise _http(exc)


@router.patch("/stages/{stage_id}")
async def patch_stage(stage_id: uuid.UUID, body: StagePatch, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return svc.stage_out(await svc.update_stage(db, ctx.tenant_id, stage_id, **body.model_dump(exclude_none=True)))
    except svc.PipelineError as exc:
        raise _http(exc)


@router.delete("/stages/{stage_id}", status_code=204, response_model=None)
async def remove_stage(stage_id: uuid.UUID, move_to: uuid.UUID | None = None, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    try:
        await svc.delete_stage(db, ctx.tenant_id, stage_id, move_to)
    except svc.PipelineError as exc:
        raise _http(exc)


# ---- board & deals ----------------------------------------------------------------------------------------------------

@router.get("/board")
async def board(owner: uuid.UUID | None = None, q: str | None = Query(default=None, max_length=100), ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    return await svc.board(db, ctx.tenant_id, owner, q)


@router.get("/deals")
async def deals(status: str | None = Query(default=None, pattern="^(open|won|lost)$"), owner: uuid.UUID | None = None, q: str | None = Query(default=None, max_length=100),
                contact_id: uuid.UUID | None = None, limit: int = Query(default=50, ge=1, le=200), offset: int = Query(default=0, ge=0),
                ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    return await svc.list_deals(db, ctx.tenant_id, status=status, owner=owner, q=q, contact_id=contact_id, limit=limit, offset=offset)


@router.post("/deals", status_code=201)
async def create(body: DealIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        deal = await svc.create_deal(db, ctx.tenant_id, title=body.title, stage_id=body.stage_id, contact_id=body.contact_id, value=body.value, currency=body.currency,
                                     owner_user_id=body.owner_user_id, expected_close=body.expected_close, notes=body.notes, user_id=ctx.user_id)
        return await svc.deal_detail(db, deal)
    except svc.PipelineError as exc:
        raise _http(exc)


@router.get("/deals/{deal_id}")
async def get_one(deal_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await svc.deal_detail(db, await svc.get_deal(db, ctx.tenant_id, deal_id))
    except svc.PipelineError as exc:
        raise _http(exc)


@router.patch("/deals/{deal_id}")
async def patch(deal_id: uuid.UUID, body: DealPatch, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        deal = await svc.get_deal(db, ctx.tenant_id, deal_id)
        deal = await svc.update_deal(db, deal, user_id=ctx.user_id, fields=body.model_dump(exclude_unset=True))
        return await svc.deal_detail(db, deal)
    except svc.PipelineError as exc:
        raise _http(exc)


@router.post("/deals/{deal_id}/move")
async def move(deal_id: uuid.UUID, body: MoveIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        deal = await svc.get_deal(db, ctx.tenant_id, deal_id)
        deal = await svc.move_deal(db, deal, body.stage_id, position=body.position, user_id=ctx.user_id, lost_reason=body.lost_reason)
        return await svc.deal_detail(db, deal)
    except svc.PipelineError as exc:
        raise _http(exc)


@router.post("/deals/{deal_id}/notes", status_code=201)
async def note(deal_id: uuid.UUID, body: NoteIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        deal = await svc.get_deal(db, ctx.tenant_id, deal_id)
        await svc.add_note(db, deal, body.text, ctx.user_id)
        return await svc.deal_detail(db, deal)
    except svc.PipelineError as exc:
        raise _http(exc)


@router.delete("/deals/{deal_id}", status_code=204, response_model=None)
async def remove(deal_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    try:
        await svc.delete_deal(db, await svc.get_deal(db, ctx.tenant_id, deal_id))
    except svc.PipelineError as exc:
        raise _http(exc)


# ---- reports & export -------------------------------------------------------------------------------------------------

@router.get("/report")
async def report(days: int = Query(default=30, ge=1, le=365), ctx: Ctx = Depends(require_feature("sales_reports")), db: AsyncSession = Depends(get_db)) -> dict:
    return await svc.report(db, ctx.tenant_id, days)


def _csv_cell(v: object) -> str:
    s = "" if v is None else str(v)
    return "'" + s if s[:1] in ("=", "+", "-", "@") else s  # neutralise spreadsheet formula injection


@router.get("/export.csv")
async def export(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> Response:
    data = await svc.list_deals(db, ctx.tenant_id, status=None, owner=None, q=None, contact_id=None, limit=5000, offset=0)
    stage_names = {s.id: s.name for s in await svc.list_stages(db, ctx.tenant_id)}
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Title", "Contact", "Phone", "Stage", "Status", "Value", "Currency", "Owner", "Expected close", "Lost reason", "Source", "Created", "Closed"])
    for d in data["items"]:
        w.writerow([_csv_cell(x) for x in (d["title"], d["contact_name"], d["contact_phone"], stage_names.get(uuid.UUID(d["stage_id"])), d["status"], d["value"] / 100, d["currency"],
                                           d["owner_name"], d["expected_close"], d["lost_reason"], d["source"], d["created_at"], d["closed_at"])])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="deals.csv"'})
