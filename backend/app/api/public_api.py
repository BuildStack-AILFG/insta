"""Public REST API (v1), authenticated with an API key: `Authorization: Bearer lfg_live_...` or `X-API-Key`. Used by Zapier/Make/custom backends."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.developer import hash_key
from app.api.deps import get_db
from app.core import ratelimit
from app.models.contact import Contact
from app.models.integration import ApiKey
from app.models.conversation import Conversation
from app.models.instagram_account import InstagramAccount
from app.models.tenant import Tenant
from app.services import quotas
from app.services.automation import events
from app.services.phone import InvalidPhone, normalize_phone
from app.services.entitlements import ensure_feature
from app.services.instagram import messaging
from app.services.instagram.graph import GraphError

router = APIRouter(prefix="/v1", tags=["public-api"])

RATE_PER_MINUTE = 300


async def api_tenant(request: Request, db: AsyncSession = Depends(get_db)) -> uuid.UUID:
    auth = request.headers.get("authorization", "")
    key = auth[7:].strip() if auth.lower().startswith("bearer ") else request.headers.get("x-api-key", "").strip()
    if not key.startswith("lfg_live_"):
        raise HTTPException(status_code=401, detail={"error": "Missing or invalid API key."}, headers={"WWW-Authenticate": "Bearer"})
    row = (await db.execute(select(ApiKey).where(ApiKey.key_hash == hash_key(key)))).scalar_one_or_none()
    if row is None or row.revoked_at is not None:
        raise HTTPException(status_code=401, detail={"error": "Missing or invalid API key."}, headers={"WWW-Authenticate": "Bearer"})
    await ensure_feature(db, row.tenant_id, "api_access")
    if not ratelimit.allow(f"apikey:{row.id}", RATE_PER_MINUTE, 60):
        raise HTTPException(status_code=429, detail={"error": f"Rate limit exceeded ({RATE_PER_MINUTE} requests/minute)."}, headers={"Retry-After": "60"})
    now = datetime.now(timezone.utc)
    if row.last_used_at is None or now - row.last_used_at > timedelta(minutes=1):
        row.last_used_at = now
        await db.commit()
    return row.tenant_id


async def _cc(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    tenant = await db.get(Tenant, tenant_id)
    return str((tenant.settings or {}).get("default_country_code", "")) if tenant else ""


def _phone(raw: str, cc: str) -> str:
    try:
        return normalize_phone(raw, cc)
    except InvalidPhone as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)})


async def _find_contact(db: AsyncSession, tenant_id: uuid.UUID, *, contact_id: uuid.UUID | None = None, username: str | None = None,
                        phone: str | None = None) -> Contact | None:
    q = select(Contact).where(Contact.tenant_id == tenant_id)
    if contact_id:
        q = q.where(Contact.id == contact_id)
    elif username:
        q = q.where(func.lower(Contact.ig_username) == username.strip().lstrip("@").lower())
    elif phone:
        q = q.where(Contact.phone == _phone(phone, await _cc(db, tenant_id)))
    else:
        return None
    return (await db.execute(q.limit(1))).scalar_one_or_none()


class LinkButton(BaseModel):
    title: str = Field(min_length=1, max_length=20)
    url: str = Field(pattern=r"^https?://", max_length=2000)


class MessageIn(BaseModel):
    contact_id: uuid.UUID | None = None
    username: str | None = Field(default=None, max_length=100, description="Instagram username of someone who has messaged or commented")
    text: str = Field(min_length=1, max_length=messaging.MAX_TEXT)
    buttons: list[LinkButton] = Field(default_factory=list, max_length=3)
    callback_data: str | None = Field(default=None, max_length=512)


@router.post("/messages", status_code=201)
async def send_message(body: MessageIn, tenant_id: uuid.UUID = Depends(api_tenant), db: AsyncSession = Depends(get_db)) -> dict:
    """DM someone who has messaged the account in the last 24 hours (Instagram never allows messaging people first)."""
    contact = await _find_contact(db, tenant_id, contact_id=body.contact_id, username=body.username)
    if contact is None or not contact.ig_user_id:
        raise HTTPException(status_code=404, detail={"error": "No Instagram contact found — pass the contact_id or username of someone who has messaged you.",
                                                     "code": "contact_not_found"})
    row = (await db.execute(select(Conversation, InstagramAccount).join(InstagramAccount, InstagramAccount.id == Conversation.account_id)
                            .where(Conversation.contact_id == contact.id, InstagramAccount.status == "connected")
                            .order_by(Conversation.last_inbound_at.desc().nullslast()).limit(1))).first()
    if row is None:
        raise HTTPException(status_code=409, detail={"error": "This contact has no conversation with a connected Instagram account.", "code": "no_account"})
    conv, account = row
    kwargs: dict = {"kind": "buttons", "buttons": [b.model_dump() for b in body.buttons]} if body.buttons else {"kind": "text"}
    try:
        msg = await messaging.send_message(db, account, conv, contact, text=body.text, sender_type="api", callback_data=body.callback_data, **kwargs)
    except messaging.SendBlocked as exc:
        raise HTTPException(status_code=409, detail={"error": exc.message, "code": exc.code})
    except GraphError as exc:
        raise HTTPException(status_code=502, detail={"error": f"Instagram rejected the message: {exc}", "code": exc.code})
    return {"result": True, "id": str(msg.id), "message_id": msg.external_id, "status": msg.status}


class ContactUpsert(BaseModel):
    contact_id: uuid.UUID | None = None
    username: str | None = Field(default=None, max_length=100, description="Update an existing Instagram contact")
    phone: str | None = Field(default=None, description="Create or update a contact by phone")
    name: str | None = Field(default=None, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    tags: list[str] = Field(default_factory=list, max_length=50)
    traits: dict = Field(default_factory=dict)


@router.post("/contacts")
async def upsert_contact(body: ContactUpsert, tenant_id: uuid.UUID = Depends(api_tenant), db: AsyncSession = Depends(get_db)) -> dict:
    """Update a contact by id / Instagram username, or create-or-update one by phone. Tags are added (never removed); traits are merged."""
    contact = await _find_contact(db, tenant_id, contact_id=body.contact_id, username=body.username, phone=body.phone)
    created = False
    if contact is None:
        if body.contact_id or body.username or not body.phone:
            raise HTTPException(status_code=404, detail={"error": "Contact not found. New contacts can only be created with a phone number.", "code": "contact_not_found"})
        total = (await db.execute(select(func.count()).select_from(Contact).where(Contact.tenant_id == tenant_id))).scalar_one()
        await quotas.enforce(db, tenant_id, "max_contacts", total, label="contacts")
        contact, created = await messaging.upsert_contact_by_phone(db, tenant_id, _phone(body.phone, await _cc(db, tenant_id)), name=body.name, source="api", email=body.email)
    if body.name and not created:
        contact.name = body.name
    if body.email:
        contact.email = body.email
    seen = {t.lower() for t in (contact.tags or [])}
    contact.tags = [*(contact.tags or []), *[t.strip()[:50] for t in body.tags if t.strip() and t.strip().lower() not in seen]][:50]
    contact.custom_fields = {**(contact.custom_fields or {}), **body.traits}
    await db.commit()
    return {"result": True, "id": str(contact.id), "created": created}


class EventIn(BaseModel):
    contact_id: uuid.UUID | None = None
    username: str | None = Field(default=None, max_length=100)
    phone: str | None = None
    event: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.\- ]+$")
    properties: dict = Field(default_factory=dict)


@router.post("/events", status_code=202)
async def track_event(body: EventIn, tenant_id: uuid.UUID = Depends(api_tenant), db: AsyncSession = Depends(get_db)) -> dict:
    contact = await _find_contact(db, tenant_id, contact_id=body.contact_id, username=body.username, phone=body.phone)
    if contact is None:
        if not body.phone:
            raise HTTPException(status_code=404, detail={"error": "Contact not found.", "code": "contact_not_found"})
        contact, _ = await messaging.upsert_contact_by_phone(db, tenant_id, _phone(body.phone, await _cc(db, tenant_id)), source="api")
    return {"result": True, **await events.process(db, tenant_id, contact, body.event, body.properties, "api")}


@router.get("/contacts")
async def list_contacts(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), tenant_id: uuid.UUID = Depends(api_tenant), db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(Contact).where(Contact.tenant_id == tenant_id).order_by(Contact.created_at, Contact.id).limit(limit + 1).offset(offset))).scalars().all()
    return {"has_next_page": len(rows) > limit, "contacts": [{"id": str(c.id), "username": c.ig_username, "phone": c.phone, "name": c.name, "email": c.email, "tags": c.tags, "traits": c.custom_fields,
                                                            "opted_out": c.opted_out} for c in rows[:limit]]}
