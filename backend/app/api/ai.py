"""AI agent configuration, knowledge base, and a test playground."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Ctx, get_ctx, get_db, require_manager
from app.core.crypto import encrypt, mask
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.knowledge import KnowledgeChunk, KnowledgeSource
from app.models.tenant import Tenant
from app.services import quotas
from app.services.ai import agent, knowledge

router = APIRouter(prefix="/ai", tags=["ai"])


class AIConfigIn(BaseModel):
    enabled: bool = False
    agent_type: Literal["support", "leads", "sales"] = "support"
    business_name: str = Field(default="", max_length=120)
    persona_name: str = Field(default="Assistant", max_length=60)
    tone: str = Field(default="friendly and professional", max_length=120)
    language: str = Field(default="", max_length=60)
    instructions: str = Field(default="", max_length=3000)
    handoff_keywords: list[str] = Field(default_factory=list, max_length=30)
    handoff_message: str = Field(default="", max_length=500)
    fallback_message: str = Field(default="", max_length=500)
    qualification_fields: list[str] = Field(default_factory=list, max_length=15)
    min_confidence: float = Field(default=0.35, ge=0, le=1)
    model: str = Field(default="", max_length=80, pattern=r"^(claude-[a-z0-9\-\.]+)?$")
    api_key: str | None = Field(default=None, max_length=300, description="Bring-your-own Anthropic key. Send '' to remove the stored key.")


def _config_out(tenant: Tenant) -> dict:
    cfg = agent.get_config(tenant)
    stored = (tenant.settings or {}).get("ai") or {}
    key_hint = ""
    if stored.get("api_key_hint"):
        key_hint = stored["api_key_hint"]
    return {**{k: v for k, v in cfg.items() if k != "has_own_key"}, "has_own_key": cfg["has_own_key"], "api_key_hint": key_hint,
            "platform_key_available": bool(agent.get_settings().anthropic_api_key), "usage_this_month": agent.usage_this_month(tenant)}


@router.get("/config")
async def get_config(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    tenant = await db.get(Tenant, ctx.tenant_id)
    out = _config_out(tenant)
    out["included_replies"] = (await quotas.quotas_for(db, ctx.tenant_id)).get("ai_replies_included_per_month")
    return out


@router.put("/config")
async def put_config(body: AIConfigIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    tenant = await db.get(Tenant, ctx.tenant_id)
    current = dict((tenant.settings or {}).get("ai") or {})
    new = {**body.model_dump(exclude={"api_key"}), "handoff_keywords": [k.strip() for k in body.handoff_keywords if k.strip()],
           "qualification_fields": [f.strip() for f in body.qualification_fields if f.strip()]}
    if body.api_key is None:  # untouched
        for k in ("api_key_enc", "api_key_hint"):
            if current.get(k):
                new[k] = current[k]
    elif body.api_key.strip():
        new["api_key_enc"], new["api_key_hint"] = encrypt(body.api_key.strip()), mask(body.api_key.strip())
    if body.enabled:
        try:
            agent._api_key(Tenant(settings={"ai": new}))  # fail early: enabling with no key would silently do nothing
        except agent.AIUnavailable as exc:
            raise HTTPException(status_code=422, detail={"error": f"{exc} Add your Anthropic API key to turn the AI agent on."})
    tenant.settings = {**(tenant.settings or {}), "ai": new, "ai_agents": {t: (t == body.agent_type and body.enabled) for t in agent.AGENT_TYPES}}
    flag_modified(tenant, "settings")
    await db.commit()
    return _config_out(tenant)


# ---- knowledge base ---------------------------------------------------------------------------------------------------

def _src_out(s: KnowledgeSource) -> dict:
    return {"id": str(s.id), "kind": s.kind, "title": s.title, "source_url": s.source_url, "status": s.status, "error": s.error, "chunk_count": s.chunk_count,
            "created_at": s.created_at.isoformat() if s.created_at else None}


@router.get("/knowledge")
async def list_sources(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(KnowledgeSource).where(KnowledgeSource.tenant_id == ctx.tenant_id).order_by(KnowledgeSource.created_at.desc()))).scalars().all()
    return [_src_out(s) for s in rows]


class TextSource(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    content: str = Field(min_length=10, max_length=200_000)


class FaqSource(BaseModel):
    items: list[dict] = Field(min_length=1, max_length=200)


class UrlSource(BaseModel):
    url: str = Field(min_length=8, max_length=2000)
    crawl: bool = True


async def _quota(db: AsyncSession, ctx: Ctx) -> None:
    await quotas.enforce(db, ctx.tenant_id, "max_knowledge_sources", await knowledge.count_sources(db, ctx.tenant_id), label="knowledge sources")


@router.post("/knowledge/text", status_code=status.HTTP_201_CREATED)
async def add_text(body: TextSource, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    await _quota(db, ctx)
    return _src_out(await knowledge.add_text(db, ctx.tenant_id, body.title, body.content))


@router.post("/knowledge/faq", status_code=status.HTTP_201_CREATED)
async def add_faq(body: FaqSource, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    await _quota(db, ctx)
    return _src_out(await knowledge.add_faq(db, ctx.tenant_id, body.items))


@router.post("/knowledge/url", status_code=status.HTTP_201_CREATED)
async def add_url(body: UrlSource, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    await _quota(db, ctx)
    src = await knowledge.add_url(db, ctx.tenant_id, body.url.strip(), body.crawl)
    return _src_out(src)


@router.get("/knowledge/{source_id}/chunks")
async def chunks(source_id: uuid.UUID, limit: int = Query(20, ge=1, le=100), ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[str]:
    s = await db.get(KnowledgeSource, source_id)
    if s is None or s.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Source not found."})
    return list((await db.execute(select(KnowledgeChunk.content).where(KnowledgeChunk.source_id == s.id).order_by(KnowledgeChunk.created_at).limit(limit))).scalars())


@router.delete("/knowledge/{source_id}", status_code=204, response_model=None)
async def delete_source(source_id: uuid.UUID, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    if not await knowledge.delete_source(db, ctx.tenant_id, source_id):
        raise HTTPException(status_code=404, detail={"error": "Source not found."})


class TestBody(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


@router.post("/test")
async def test_agent(body: TestBody, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    """Playground: run the agent against a throwaway contact without sending anything on Instagram."""
    tenant = await db.get(Tenant, ctx.tenant_id)
    probe_contact = Contact(tenant_id=ctx.tenant_id, name="Test customer", phone="0000000000", custom_fields={})
    probe_conv = Conversation(id=uuid.uuid4(), tenant_id=ctx.tenant_id, contact_id=uuid.uuid4(), account_id=uuid.uuid4())
    try:
        res = await agent.answer(db, tenant, probe_conv, probe_contact, body.question)
    except agent.AIUnavailable as exc:
        raise HTTPException(status_code=409, detail={"error": str(exc), "code": "ai_unavailable"})
    await db.commit()  # persists the usage counter only
    chunks_used = await knowledge.retrieve(db, ctx.tenant_id, body.question, k=3)
    return {"reply": res.reply, "handoff": res.handoff, "confidence": res.confidence, "collected": res.collected, "sources": [c[:160] for c in chunks_used]}


class WriteIn(BaseModel):
    purpose: Literal["dm", "public_reply", "caption"]
    brief: str = Field(min_length=3, max_length=1500)


@router.post("/write")
async def write(body: WriteIn, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    """AI copywriter for DMs, public replies and captions. Counts toward the workspace's AI allowance."""
    tenant = await db.get(Tenant, ctx.tenant_id)
    try:
        options = await agent.write_copy(db, tenant, body.purpose, body.brief)
    except agent.AIUnavailable as exc:
        raise HTTPException(status_code=409, detail={"error": str(exc), "code": "ai_unavailable"})
    await db.commit()
    return {"options": options}
