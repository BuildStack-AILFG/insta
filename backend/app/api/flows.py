"""Automation flows: build (draft graph), validate + publish, run manually, inspect executions."""

from __future__ import annotations

import copy
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.models.automation_execution import AutomationExecution
from app.models.automation_flow import AutomationFlow
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.instagram_account import InstagramAccount
from app.services import quotas
from app.services.automation import flow_engine

router = APIRouter(prefix="/flows", tags=["flows"])

TriggerType = Literal["incoming_message", "keyword", "contact_created", "story_reply", "manual", "webhook", "event"]
MAX_NODES = 300


class FlowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    trigger_type: TriggerType = "incoming_message"
    graph: dict | None = None


class FlowSave(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    trigger_type: TriggerType | None = None
    graph: dict | None = None


def _default_graph(trigger: str) -> dict:
    return {"nodes": [{"id": "start", "type": "start", "position": {"x": 80, "y": 120}, "data": {"trigger": trigger, "label": "Start"}}], "edges": []}


def _check_shape(graph: dict) -> None:
    if not isinstance(graph, dict) or not isinstance(graph.get("nodes", []), list) or not isinstance(graph.get("edges", []), list):
        raise HTTPException(status_code=422, detail={"error": "Invalid flow structure."})
    if len(graph.get("nodes", [])) > MAX_NODES:
        raise HTTPException(status_code=422, detail={"error": f"A flow can have at most {MAX_NODES} steps."})
    ids = [n.get("id") for n in graph.get("nodes", [])]
    if any(not isinstance(i, str) or not i for i in ids) or len(set(ids)) != len(ids):
        raise HTTPException(status_code=422, detail={"error": "Every step needs a unique id."})


def _out(f: AutomationFlow, *, full: bool = False) -> dict:
    d = {
        "id": str(f.id), "name": f.name, "trigger_type": f.trigger_type, "status": f.status, "version": f.version, "conversations_sent": f.conversations_sent,
        "updated_at": f.updated_at.isoformat() if f.updated_at else None, "node_count": len((f.graph or {}).get("nodes", [])),
        "has_unpublished_changes": f.status == "published" and f.graph != f.published_snapshot,
    }
    if full:
        d["graph"] = f.graph
    return d


async def _owned(db: AsyncSession, ctx: Ctx, flow_id: uuid.UUID) -> AutomationFlow:
    f = await db.get(AutomationFlow, flow_id)
    if f is None or f.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Flow not found."})
    return f


@router.get("")
async def list_flows(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(AutomationFlow).where(AutomationFlow.tenant_id == ctx.tenant_id).order_by(AutomationFlow.created_at.desc()))).scalars().all()
    return [_out(f) for f in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_flow(body: FlowCreate, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    total = (await db.execute(select(func.count()).select_from(AutomationFlow).where(AutomationFlow.tenant_id == ctx.tenant_id))).scalar_one()
    await quotas.enforce(db, ctx.tenant_id, "max_automation_flows", total, label="automation flows")
    graph = body.graph or _default_graph(body.trigger_type)
    _check_shape(graph)
    f = AutomationFlow(tenant_id=ctx.tenant_id, name=body.name.strip(), trigger_type=body.trigger_type, status="draft", graph=graph)
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return _out(f, full=True)


@router.get("/{flow_id}")
async def get_flow(flow_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    f = await _owned(db, ctx, flow_id)
    return {**_out(f, full=True), "errors": flow_engine.validate_graph(f.graph or {})}


@router.put("/{flow_id}")
async def save_flow(flow_id: uuid.UUID, body: FlowSave, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    f = await _owned(db, ctx, flow_id)
    if body.name:
        f.name = body.name.strip()
    if body.trigger_type:
        f.trigger_type = body.trigger_type
    if body.graph is not None:
        _check_shape(body.graph)
        f.graph = body.graph
    await db.commit()
    await db.refresh(f)
    return {**_out(f, full=True), "errors": flow_engine.validate_graph(f.graph or {})}


@router.post("/{flow_id}/publish")
async def publish(flow_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    f = await _owned(db, ctx, flow_id)
    errors = flow_engine.validate_graph(f.graph or {})
    if errors:
        raise HTTPException(status_code=422, detail={"error": "Fix these problems before publishing.", "problems": errors})
    f.published_snapshot, f.status, f.version = copy.deepcopy(f.graph), "published", (f.version or 0) + 1
    await db.commit()
    await db.refresh(f)
    return _out(f, full=True)


@router.post("/{flow_id}/unpublish")
async def unpublish(flow_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    f = await _owned(db, ctx, flow_id)
    f.status = "draft"
    await db.execute(AutomationExecution.__table__.update().where(AutomationExecution.flow_id == f.id, AutomationExecution.status.in_(("running", "waiting"))).values(status="cancelled"))
    await db.commit()
    await db.refresh(f)
    return _out(f, full=True)


@router.post("/{flow_id}/duplicate", status_code=201)
async def duplicate(flow_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    src = await _owned(db, ctx, flow_id)
    total = (await db.execute(select(func.count()).select_from(AutomationFlow).where(AutomationFlow.tenant_id == ctx.tenant_id))).scalar_one()
    await quotas.enforce(db, ctx.tenant_id, "max_automation_flows", total, label="automation flows")
    f = AutomationFlow(tenant_id=ctx.tenant_id, name=f"{src.name} (copy)"[:200], trigger_type=src.trigger_type, status="draft", graph=copy.deepcopy(src.graph))
    db.add(f)
    await db.commit()
    await db.refresh(f)
    return _out(f, full=True)


@router.delete("/{flow_id}", status_code=204, response_model=None)
async def delete_flow(flow_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    await db.delete(await _owned(db, ctx, flow_id))
    await db.commit()


class RunBody(BaseModel):
    contact_id: uuid.UUID
    context: dict = Field(default_factory=dict)


@router.post("/{flow_id}/run")
async def run_flow(flow_id: uuid.UUID, body: RunBody, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    """Manually start a published flow for one contact (also how 'manual' trigger flows are used)."""
    f = await _owned(db, ctx, flow_id)
    if f.status != "published":
        raise HTTPException(status_code=409, detail={"error": "Publish the flow before running it."})
    contact = await db.get(Contact, body.contact_id)
    if contact is None or contact.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Contact not found."})
    # Messages can only go to someone with an Instagram conversation; other steps (tags, deals, webhooks) still run without one.
    conv = (await db.execute(select(Conversation).join(InstagramAccount, InstagramAccount.id == Conversation.account_id)
                             .where(Conversation.contact_id == contact.id, InstagramAccount.status == "connected")
                             .order_by(Conversation.last_inbound_at.desc().nullslast()).limit(1))).scalar_one_or_none()
    ex = await flow_engine.start_flow(db, f, contact, conv, context=body.context)
    if ex is None:
        raise HTTPException(status_code=409, detail={"error": "This contact is already in this flow."})
    await db.commit()
    return {"execution_id": str(ex.id), "status": ex.status}


@router.get("/{flow_id}/executions")
async def executions(flow_id: uuid.UUID, limit: int = Query(30, ge=1, le=100), ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    f = await _owned(db, ctx, flow_id)
    rows = (await db.execute(select(AutomationExecution, Contact).join(Contact, Contact.id == AutomationExecution.contact_id)
                             .where(AutomationExecution.flow_id == f.id).order_by(AutomationExecution.created_at.desc()).limit(limit))).all()
    return [{"id": str(e.id), "status": e.status, "current_node": e.current_node, "contact": {"id": str(c.id), "name": c.name, "username": c.ig_username, "phone": c.phone}, "error": e.error,
             "wait_until": e.wait_until.isoformat() if e.wait_until else None, "created_at": e.created_at.isoformat() if e.created_at else None} for e, c in rows]


@router.get("/{flow_id}/executions/{execution_id}")
async def execution_detail(flow_id: uuid.UUID, execution_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    await _owned(db, ctx, flow_id)
    e = await db.get(AutomationExecution, execution_id)
    if e is None or e.flow_id != flow_id:
        raise HTTPException(status_code=404, detail={"error": "Execution not found."})
    return {"id": str(e.id), "status": e.status, "current_node": e.current_node, "context": e.context, "events": e.events, "error": e.error}


@router.post("/{flow_id}/executions/{execution_id}/cancel")
async def cancel_execution(flow_id: uuid.UUID, execution_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    await _owned(db, ctx, flow_id)
    e = await db.get(AutomationExecution, execution_id)
    if e is None or e.flow_id != flow_id:
        raise HTTPException(status_code=404, detail={"error": "Execution not found."})
    if e.status in {"running", "waiting"}:
        e.status, e.waiting_for = "cancelled", None
        await db.commit()
    return {"status": e.status}
