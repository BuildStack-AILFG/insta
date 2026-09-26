"""Comment automations (comment -> public reply + DM) and the comment activity log."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.models.automation_flow import AutomationFlow
from app.models.comment_automation import CommentAutomation, InstagramComment
from app.models.conversation import Message
from app.models.instagram_account import InstagramAccount
from app.models.tracked_link import TrackedLink
from app.services import quotas
from app.services.instagram import moderation

router = APIRouter(prefix="/comment-automations", tags=["comment-automations"])


class DmButton(BaseModel):
    title: str = Field(min_length=1, max_length=20)
    url: str = Field(pattern=r"^https?://[^\s]+$", max_length=2000)


class MediaPreview(BaseModel):
    id: str = Field(max_length=64)
    caption: str | None = Field(default=None, max_length=300)
    thumbnail_url: str | None = Field(default=None, max_length=2000)
    permalink: str | None = Field(default=None, max_length=500)


def _clean(values: list[str], limit: int, max_len: int) -> list[str]:
    out: list[str] = []
    for v in values:
        v = v.strip()[:max_len]
        if v and v.casefold() not in {o.casefold() for o in out}:
            out.append(v)
    return out[:limit]


class AutomationIn(BaseModel):
    account_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    status: Literal["active", "paused"] = "active"
    media_scope: Literal["all", "specific", "next", "live"] = "specific"
    media_ids: list[str] = Field(default_factory=list, max_length=50)
    media_preview: list[MediaPreview] = Field(default_factory=list, max_length=50)
    match_type: Literal["any", "contains", "exact"] = "contains"
    keywords: list[str] = Field(default_factory=list, max_length=50)
    exclude_keywords: list[str] = Field(default_factory=list, max_length=50)
    public_reply_enabled: bool = True
    public_replies: list[str] = Field(default_factory=list, max_length=10)
    dm_enabled: bool = True
    dm_text: str = Field(default="", max_length=1000)
    dm_text_b: str = Field(default="", max_length=1000)  # optional A/B variant
    dm_buttons: list[DmButton] = Field(default_factory=list, max_length=3)
    flow_id: uuid.UUID | None = None
    once_per_user: bool = True
    gate: Literal["none", "follow", "email", "phone"] = "none"
    gate_prompt: str = Field(default="", max_length=640)
    gate_button: str = Field(default="", max_length=20)
    gate_retry_text: str = Field(default="", max_length=640)
    track_clicks: bool = True
    reminder_enabled: bool = False
    reminder_after_minutes: int = Field(default=120, ge=5, le=1380)
    reminder_text: str = Field(default="", max_length=640)

    @field_validator("keywords", "exclude_keywords")
    @classmethod
    def _kw(cls, v: list[str]) -> list[str]:
        return _clean(v, 50, 60)

    @field_validator("public_replies")
    @classmethod
    def _replies(cls, v: list[str]) -> list[str]:
        return _clean(v, 10, 300)

    @model_validator(mode="after")
    def _check(self):
        if self.match_type != "any" and not self.keywords:
            raise ValueError("Add at least one keyword, or trigger on any comment.")
        if self.media_scope == "specific" and not self.media_ids:
            raise ValueError("Choose at least one post or reel.")
        if not (self.public_reply_enabled and self.public_replies) and not (self.dm_enabled and self.dm_text.strip()):
            raise ValueError("Turn on a public reply or a DM — otherwise the automation does nothing.")
        if self.dm_enabled and not self.dm_text.strip():
            raise ValueError("Write the DM message.")
        if self.public_reply_enabled and not self.public_replies:
            raise ValueError("Add at least one public reply, or turn public replies off.")
        if self.reminder_enabled and not (self.dm_enabled and self.dm_buttons and self.track_clicks):
            raise ValueError("Click reminders need a DM with link buttons and click tracking on.")
        if self.gate != "none" and not self.dm_enabled:
            raise ValueError("An unlock step needs the DM turned on — it's what gets delivered once they unlock it.")
        return self


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _out(a: CommentAutomation, username: str | None = None) -> dict:
    return {
        "id": str(a.id), "account_id": str(a.account_id), "account_username": username, "name": a.name, "status": a.status,
        "media_scope": a.media_scope, "media_ids": a.media_ids or [], "media_preview": a.media_preview or [],
        "match_type": a.match_type, "keywords": a.keywords or [], "exclude_keywords": a.exclude_keywords or [],
        "public_reply_enabled": a.public_reply_enabled, "public_replies": a.public_replies or [],
        "dm_enabled": a.dm_enabled, "dm_text": a.dm_text, "dm_text_b": a.dm_text_b, "dm_buttons": a.dm_buttons or [], "flow_id": str(a.flow_id) if a.flow_id else None,
        "once_per_user": a.once_per_user, "gate": a.gate, "gate_prompt": a.gate_prompt, "gate_button": a.gate_button, "gate_retry_text": a.gate_retry_text,
        "track_clicks": a.track_clicks, "reminder_enabled": a.reminder_enabled, "reminder_after_minutes": a.reminder_after_minutes, "reminder_text": a.reminder_text,
        "stats": {"comments_matched": a.comments_matched, "public_replies_sent": a.public_replies_sent, "dms_sent": a.dms_sent,
                  "gates_passed": a.gates_passed, "link_clicks": a.link_clicks, "reminders_sent": a.reminders_sent},
        "last_triggered_at": _iso(a.last_triggered_at), "created_at": _iso(a.created_at), "updated_at": _iso(a.updated_at),
    }


async def _owned(db: AsyncSession, ctx: Ctx, automation_id: uuid.UUID) -> CommentAutomation:
    a = await db.get(CommentAutomation, automation_id)
    if a is None or a.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Automation not found."})
    return a


async def _validate_refs(db: AsyncSession, ctx: Ctx, body: AutomationIn) -> InstagramAccount:
    account = await db.get(InstagramAccount, body.account_id)
    if account is None or account.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=422, detail={"error": "Choose one of your connected Instagram accounts."})
    if body.flow_id:
        flow = await db.get(AutomationFlow, body.flow_id)
        if flow is None or flow.tenant_id != ctx.tenant_id:
            raise HTTPException(status_code=422, detail={"error": "That flow doesn't exist."})
    return account


def _apply(a: CommentAutomation, body: AutomationIn) -> None:
    data = body.model_dump(mode="json")
    for key in ("name", "status", "media_scope", "match_type", "keywords", "exclude_keywords", "public_reply_enabled", "public_replies",
                "dm_enabled", "dm_text", "dm_text_b", "once_per_user", "gate", "gate_prompt", "gate_button", "gate_retry_text", "track_clicks",
                "reminder_enabled", "reminder_after_minutes", "reminder_text"):
        setattr(a, key, data[key])
    a.name = a.name.strip()
    a.account_id = body.account_id
    a.media_ids = body.media_ids if body.media_scope == "specific" else []
    a.media_preview = [p for p in data["media_preview"] if p["id"] in a.media_ids] if body.media_scope == "specific" else []
    a.dm_buttons = data["dm_buttons"]
    a.flow_id = body.flow_id


@router.get("")
async def list_automations(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(CommentAutomation, InstagramAccount.username).join(InstagramAccount, InstagramAccount.id == CommentAutomation.account_id)
                             .where(CommentAutomation.tenant_id == ctx.tenant_id).order_by(CommentAutomation.created_at.desc()))).all()
    return [_out(a, username) for a, username in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_automation(body: AutomationIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    account = await _validate_refs(db, ctx, body)
    count = (await db.execute(select(func.count()).select_from(CommentAutomation).where(CommentAutomation.tenant_id == ctx.tenant_id))).scalar_one()
    await quotas.enforce(db, ctx.tenant_id, "max_comment_automations", count, label="comment automations")
    a = CommentAutomation(tenant_id=ctx.tenant_id, account_id=body.account_id, name=body.name)
    _apply(a, body)
    db.add(a)
    await db.commit()
    await db.refresh(a)
    return _out(a, account.username)


@router.get("/{automation_id}")
async def get_automation(automation_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    a = await _owned(db, ctx, automation_id)
    account = await db.get(InstagramAccount, a.account_id)
    return _out(a, account.username if account else None)


@router.put("/{automation_id}")
async def update_automation(automation_id: uuid.UUID, body: AutomationIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    a = await _owned(db, ctx, automation_id)
    account = await _validate_refs(db, ctx, body)
    _apply(a, body)
    await db.commit()
    await db.refresh(a)
    return _out(a, account.username)


class StatusPatch(BaseModel):
    status: Literal["active", "paused"]


@router.patch("/{automation_id}")
async def set_status(automation_id: uuid.UUID, body: StatusPatch, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    a = await _owned(db, ctx, automation_id)
    a.status = body.status
    await db.commit()
    await db.refresh(a)
    account = await db.get(InstagramAccount, a.account_id)
    return _out(a, account.username if account else None)


@router.delete("/{automation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_automation(automation_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    a = await _owned(db, ctx, automation_id)
    await db.delete(a)
    await db.commit()


@router.get("/{automation_id}/variants")
async def variant_results(automation_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    """A/B results: how many people got each DM variant and how many of them clicked a link."""
    a = await _owned(db, ctx, automation_id)
    m = Message
    variant = m.payload.op("->>")(literal_column("'variant'"))  # one literal expression, so SELECT and GROUP BY match
    sent = dict((await db.execute(
        select(variant, func.count(func.distinct(m.conversation_id)))
        .where(m.tenant_id == ctx.tenant_id, m.direction == "out", m.payload["automation_id"].as_string() == str(a.id), variant.in_(("A", "B")))
        .group_by(variant))).all())
    clicked = dict((await db.execute(
        select(TrackedLink.variant, func.count(func.distinct(TrackedLink.contact_id)))
        .where(TrackedLink.automation_id == a.id, TrackedLink.clicks > 0, TrackedLink.variant.in_(("A", "B")))
        .group_by(TrackedLink.variant))).all())
    out = {}
    for v in ("A", "B"):
        n, c = int(sent.get(v, 0)), int(clicked.get(v, 0))
        out[v] = {"sent": n, "clicked": c, "click_rate": round(100 * c / n, 1) if n else 0.0}
    return {"enabled": bool((a.dm_text_b or "").strip()), **out}


# ---- activity ---------------------------------------------------------------------------------------------------

@router.get("/activity/comments")
async def comment_activity(automation_id: uuid.UUID | None = None, outcome: str | None = Query(None, max_length=24),
                           limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                           ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    """Every comment Instagram delivered, with what automation did about it. Newest first."""
    cond = [InstagramComment.tenant_id == ctx.tenant_id, InstagramComment.outcome != "own_comment"]
    if automation_id:
        cond.append(InstagramComment.automation_id == automation_id)
    if outcome:
        cond.append(InstagramComment.outcome == outcome)
    total = (await db.execute(select(func.count()).select_from(InstagramComment).where(*cond))).scalar_one()
    rows = (await db.execute(select(InstagramComment, CommentAutomation.name).outerjoin(CommentAutomation, CommentAutomation.id == InstagramComment.automation_id)
                             .where(*cond).order_by(InstagramComment.created_at.desc()).limit(limit).offset(offset))).all()
    return {"total": total, "items": [{
        "moderation": c.moderation, "moderation_reason": c.moderation_reason,
        "id": str(c.id), "comment_id": c.comment_id, "media_id": c.media_id, "media_product_type": c.media_product_type, "is_live": c.is_live,
        "username": c.from_username, "text": c.text, "outcome": c.outcome, "error": c.error,
        "automation": {"id": str(c.automation_id), "name": name} if c.automation_id else None,
        "public_reply": bool(c.public_reply_id), "dm_sent": bool(c.dm_message_id), "contact_id": str(c.contact_id) if c.contact_id else None,
        "created_at": _iso(c.created_at),
    } for c, name in rows]}


class ModerateIn(BaseModel):
    action: Literal["hide", "unhide", "delete"]


@router.post("/activity/comments/{row_id}/moderate")
async def moderate_comment(row_id: uuid.UUID, body: ModerateIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    """Hide, unhide or delete one comment on Instagram from the activity log."""
    row = await db.get(InstagramComment, row_id)
    if row is None or row.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Comment not found."})
    if row.moderation == "deleted":
        raise HTTPException(status_code=409, detail={"error": "This comment was deleted."})
    account = await db.get(InstagramAccount, row.account_id)
    error = await moderation.apply(account, row, body.action, "by a teammate")
    if error:
        raise HTTPException(status_code=502, detail={"error": f"Instagram refused: {error}"})
    await db.commit()
    return {"id": str(row.id), "moderation": row.moderation, "moderation_reason": row.moderation_reason}
