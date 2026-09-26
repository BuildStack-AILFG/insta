from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.models.automation_flow import AutomationFlow
from app.models.custom_reply import CustomReply

router = APIRouter(prefix="/custom-replies", tags=["custom-replies"])

MatchType = Literal["exact", "contains", "any"]


class CustomReplyCreate(BaseModel):
    trigger: str = Field(default="", max_length=500, description="One or more keywords, separated by commas or new lines")
    match_type: MatchType = "contains"
    reply_text: str = Field(default="", max_length=4096)
    flow_id: uuid.UUID | None = None
    priority: int = Field(default=0, ge=-100, le=100)


class CustomReplyUpdate(BaseModel):
    trigger: str | None = Field(default=None, max_length=500)
    match_type: MatchType | None = None
    reply_text: str | None = Field(default=None, max_length=4096)
    flow_id: uuid.UUID | None = None
    priority: int | None = Field(default=None, ge=-100, le=100)
    enabled: bool | None = None


class CustomReplyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    trigger: str
    match_type: str
    reply_text: str
    flow_id: uuid.UUID | None
    priority: int
    enabled: bool
    conversations_sent: int


async def _check(db: AsyncSession, ctx: Ctx, trigger: str, match_type: str, reply_text: str, flow_id: uuid.UUID | None) -> None:
    if match_type != "any" and not trigger.strip():
        raise HTTPException(status_code=422, detail={"error": "Add at least one trigger keyword."})
    if not reply_text.strip() and not flow_id:
        raise HTTPException(status_code=422, detail={"error": "Add a reply message or choose a flow to run."})
    if flow_id:
        flow = await db.get(AutomationFlow, flow_id)
        if flow is None or flow.tenant_id != ctx.tenant_id:
            raise HTTPException(status_code=404, detail={"error": "Flow not found."})


@router.get("", response_model=list[CustomReplyOut])
async def list_custom_replies(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[CustomReply]:
    result = await db.execute(select(CustomReply).where(CustomReply.tenant_id == ctx.tenant_id).order_by(CustomReply.priority.desc(), CustomReply.created_at.desc()))
    return list(result.scalars().all())


@router.post("", response_model=CustomReplyOut, status_code=status.HTTP_201_CREATED)
async def create_custom_reply(body: CustomReplyCreate, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> CustomReply:
    await _check(db, ctx, body.trigger, body.match_type, body.reply_text, body.flow_id)
    reply = CustomReply(tenant_id=ctx.tenant_id, trigger=body.trigger.strip() or "*", match_type=body.match_type, reply_text=body.reply_text, flow_id=body.flow_id, priority=body.priority)
    db.add(reply)
    await db.commit()
    await db.refresh(reply)
    return reply


async def _get_owned_reply(reply_id: uuid.UUID, ctx: Ctx, db: AsyncSession) -> CustomReply:
    reply = await db.get(CustomReply, reply_id)
    if reply is None or reply.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Custom reply not found."})
    return reply


@router.patch("/{reply_id}", response_model=CustomReplyOut)
async def update_custom_reply(reply_id: uuid.UUID, body: CustomReplyUpdate, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> CustomReply:
    reply = await _get_owned_reply(reply_id, ctx, db)
    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(reply, field, value)
    await _check(db, ctx, reply.trigger, reply.match_type, reply.reply_text, reply.flow_id)
    await db.commit()
    await db.refresh(reply)
    return reply


@router.delete("/{reply_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_custom_reply(reply_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    reply = await _get_owned_reply(reply_id, ctx, db)
    await db.delete(reply)
    await db.commit()
