"""Contacts: CRUD, search/filter, CSV import/export, tags, traits, events, bulk actions."""

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.models.contact import Contact
from app.models.contact_event import ContactEvent
from app.models.segment import Segment
from app.models.tenant import Tenant
from app.services import outbound_webhooks, quotas, segments
from app.services.phone import InvalidPhone, normalize_phone

router = APIRouter(prefix="/contacts", tags=["contacts"])

MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 20_000
KNOWN_COLUMNS = {"phone", "name", "email", "tags", "opted_out"}
COLUMN_ALIASES = {"mobile": "phone", "phone_number": "phone", "phonenumber": "phone", "whatsapp": "phone", "number": "phone", "full_name": "name", "fullname": "name",
                  "email_address": "email", "tag": "tags", "labels": "tags"}


def _out(c: Contact) -> dict:
    return {
        "id": str(c.id), "name": c.name, "username": c.ig_username, "profile_pic_url": c.profile_pic_url, "is_follower": c.is_follower,
        "follower_count": c.follower_count, "phone": c.phone, "email": c.email, "tags": c.tags or [], "traits": c.custom_fields or {}, "source": c.source,
        "opted_out": c.opted_out, "last_contacted_at": c.last_contacted_at.isoformat() if c.last_contacted_at else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


async def _default_cc(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    tenant = await db.get(Tenant, tenant_id)
    return str((tenant.settings or {}).get("default_country_code", "")) if tenant else ""


async def _owned(db: AsyncSession, ctx: Ctx, contact_id: uuid.UUID) -> Contact:
    c = await db.get(Contact, contact_id)
    if c is None or c.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Contact not found."})
    return c


def _clean_tags(tags: list[str]) -> list[str]:
    seen: list[str] = []
    for t in tags:
        t = t.strip()[:50]
        if t and t.lower() not in {x.lower() for x in seen}:
            seen.append(t)
    return seen[:50]


class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    phone: str = Field(min_length=3, max_length=32)
    email: str | None = Field(default=None, max_length=320)
    tags: list[str] = Field(default_factory=list)
    traits: dict = Field(default_factory=dict)


class ContactUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, min_length=3, max_length=32)
    tags: list[str] | None = None
    traits: dict | None = None
    opted_out: bool | None = None


def _filters(tenant_id, q, tag, opted_out, source):
    cond = [Contact.tenant_id == tenant_id]
    if q and q.strip():
        like = f"%{q.strip()}%"
        cond.append(or_(Contact.name.ilike(like), Contact.ig_username.ilike(like.replace("@", "")), Contact.phone.ilike(like.replace("+", "")), Contact.email.ilike(like)))
    if tag:
        cond.append(Contact.tags.any(tag))
    if opted_out is not None:
        cond.append(Contact.opted_out.is_(opted_out))
    if source:
        cond.append(Contact.source == source)
    return cond


@router.get("")
async def list_contacts(
    q: str | None = None, tag: str | None = None, opted_out: bool | None = None, source: str | None = None, segment_id: uuid.UUID | None = None,
    sort: Literal["created", "name", "last_contacted"] = "created", limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db),
) -> dict:
    cond = _filters(ctx.tenant_id, q, tag, opted_out, source)
    if segment_id:
        seg = await db.get(Segment, segment_id)
        if seg is None or seg.tenant_id != ctx.tenant_id:
            raise HTTPException(status_code=404, detail={"error": "Segment not found."})
        try:
            cond.append(segments.build_filter(ctx.tenant_id, seg.filters))
        except segments.SegmentError as exc:
            raise HTTPException(status_code=422, detail={"error": str(exc)})
    order = {"created": Contact.created_at.desc(), "name": func.lower(Contact.name), "last_contacted": Contact.last_contacted_at.desc().nullslast()}[sort]
    total = (await db.execute(select(func.count()).select_from(Contact).where(*cond))).scalar_one()
    rows = (await db.execute(select(Contact).where(*cond).order_by(order, Contact.id).limit(limit).offset(offset))).scalars().all()
    return {"total": total, "items": [_out(c) for c in rows]}


@router.get("/tags")
async def list_tags(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    tag = func.unnest(Contact.tags).label("tag")
    sub = select(tag).where(Contact.tenant_id == ctx.tenant_id).subquery()
    rows = (await db.execute(select(sub.c.tag, func.count()).group_by(sub.c.tag).order_by(func.count().desc(), sub.c.tag))).all()
    return [{"tag": t, "count": n} for t, n in rows]


@router.get("/traits")
async def list_traits(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[str]:
    keys = func.json_object_keys(Contact.custom_fields)
    rows = (await db.execute(select(keys).where(Contact.tenant_id == ctx.tenant_id).distinct().limit(200))).scalars().all()
    return sorted(rows)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_contact(body: ContactCreate, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        phone = normalize_phone(body.phone, await _default_cc(db, ctx.tenant_id))
    except InvalidPhone as exc:
        raise HTTPException(status_code=422, detail={"error": str(exc)})
    total = (await db.execute(select(func.count()).select_from(Contact).where(Contact.tenant_id == ctx.tenant_id))).scalar_one()
    await quotas.enforce(db, ctx.tenant_id, "max_contacts", total, label="contacts")
    contact = Contact(tenant_id=ctx.tenant_id, name=body.name.strip(), phone=phone, email=(body.email or None), tags=_clean_tags(body.tags), custom_fields=body.traits, source="manual")
    db.add(contact)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"error": "A contact with this phone number already exists."})
    await db.refresh(contact)
    await outbound_webhooks.emit(ctx.tenant_id, "contact_created", {"contact_id": str(contact.id), "phone": contact.phone, "source": "manual"})
    return _out(contact)


@router.get("/{contact_id}")
async def get_contact(contact_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    c = await _owned(db, ctx, contact_id)
    events = (await db.execute(select(ContactEvent).where(ContactEvent.contact_id == c.id).order_by(ContactEvent.created_at.desc()).limit(50))).scalars().all()
    return {**_out(c), "events": [{"name": e.name, "properties": e.properties, "source": e.source, "at": e.created_at.isoformat()} for e in events],
            "ad_attribution": c.ad_attribution}


@router.patch("/{contact_id}")
async def update_contact(contact_id: uuid.UUID, body: ContactUpdate, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    c = await _owned(db, ctx, contact_id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        c.name = data["name"].strip()
    if "email" in data:
        c.email = data["email"] or None
    if "phone" in data and data["phone"]:
        try:
            c.phone = normalize_phone(data["phone"], await _default_cc(db, ctx.tenant_id))
        except InvalidPhone as exc:
            raise HTTPException(status_code=422, detail={"error": str(exc)})
    if data.get("tags") is not None:
        c.tags = _clean_tags(data["tags"])
    if data.get("traits") is not None:
        c.custom_fields = data["traits"]
    if "opted_out" in data and data["opted_out"] is not None and data["opted_out"] != c.opted_out:
        c.opted_out = data["opted_out"]
        c.opted_out_at = datetime.now(timezone.utc) if c.opted_out else None
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail={"error": "Another contact already uses this phone number."})
    await db.refresh(c)
    return _out(c)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_contact(contact_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    c = await _owned(db, ctx, contact_id)
    await db.delete(c)
    await db.commit()


class EventIn(BaseModel):
    name: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_.\- ]+$")
    properties: dict = Field(default_factory=dict)


@router.post("/{contact_id}/events", status_code=201)
async def add_event(contact_id: uuid.UUID, body: EventIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    c = await _owned(db, ctx, contact_id)
    db.add(ContactEvent(tenant_id=ctx.tenant_id, contact_id=c.id, name=body.name, properties=body.properties, source="dashboard"))
    await db.commit()
    return {"ok": True}


# ---- import / export ----------------------------------------------------------------------------------------------

def _parse_csv(raw: bytes) -> tuple[list[str], list[dict]]:
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("latin-1")
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail={"error": "The file is empty."})
    headers = []
    for h in reader.fieldnames:
        key = (h or "").strip().lower().replace(" ", "_")
        headers.append(COLUMN_ALIASES.get(key, key))
    if "phone" not in headers:
        raise HTTPException(status_code=422, detail={"error": "The file needs a 'phone' column (also accepted: mobile, phone_number, whatsapp, number)."})
    rows = []
    for raw_row in reader:
        row = {headers[i]: (v or "").strip() for i, v in enumerate(raw_row.values()) if i < len(headers) and headers[i]}
        if any(row.values()):
            rows.append(row)
        if len(rows) > MAX_IMPORT_ROWS:
            raise HTTPException(status_code=413, detail={"error": f"Too many rows (max {MAX_IMPORT_ROWS:,} per import)."})
    return headers, rows


@router.post("/import")
async def import_contacts(file: UploadFile = File(...), default_country_code: str = Form(""), update_existing: bool = Form(True), add_tag: str = Form(""),
                          ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    raw = await file.read(MAX_IMPORT_BYTES + 1)
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail={"error": "File is larger than 5 MB."})
    _, rows = _parse_csv(raw)
    cc = default_country_code or await _default_cc(db, ctx.tenant_id)

    existing_total = (await db.execute(select(func.count()).select_from(Contact).where(Contact.tenant_id == ctx.tenant_id))).scalar_one()
    limit = (await quotas.quotas_for(db, ctx.tenant_id)).get("max_contacts")
    room = None if limit is None or limit < 0 else max(limit - existing_total, 0)

    created = updated = skipped = 0
    errors: list[dict] = []
    seen: set[str] = set()
    existing: dict[str, Contact] = {}
    for i in range(0, len(rows), 1000):  # look up existing contacts in chunks
        phones = []
        for r in rows[i:i + 1000]:
            try:
                phones.append(normalize_phone(r.get("phone", ""), cc))
            except InvalidPhone:
                pass
        if phones:
            existing.update({c.phone: c for c in (await db.execute(select(Contact).where(Contact.tenant_id == ctx.tenant_id, Contact.phone.in_(phones)))).scalars()})
    tag_to_add = add_tag.strip()

    for line, r in enumerate(rows, start=2):  # line 1 is the header
        try:
            phone = normalize_phone(r.get("phone", ""), cc)
        except InvalidPhone as exc:
            skipped += 1
            errors.append({"row": line, "error": str(exc)})
            continue
        if phone in seen:
            skipped += 1
            errors.append({"row": line, "error": "Duplicate phone number in this file."})
            continue
        seen.add(phone)
        tags = _clean_tags([t for t in r.get("tags", "").replace(";", ",").replace("|", ",").split(",")] + ([tag_to_add] if tag_to_add else []))
        traits = {k: v for k, v in r.items() if k not in KNOWN_COLUMNS and v}
        opted_out = str(r.get("opted_out", "")).lower() in {"true", "yes", "1", "y"}
        contact = existing.get(phone)
        if contact is None:
            if room is not None and created >= room:
                skipped += 1
                errors.append({"row": line, "error": f"Plan limit of {limit} contacts reached."})
                continue
            db.add(Contact(tenant_id=ctx.tenant_id, name=r.get("name") or f"+{phone}", phone=phone, email=r.get("email") or None, tags=tags, custom_fields=traits, source="import",
                           opted_out=opted_out, opted_out_at=datetime.now(timezone.utc) if opted_out else None))
            created += 1
        elif update_existing:
            if r.get("name"):
                contact.name = r["name"]
            if r.get("email"):
                contact.email = r["email"]
            contact.tags = _clean_tags([*(contact.tags or []), *tags])
            contact.custom_fields = {**(contact.custom_fields or {}), **traits}
            if opted_out and not contact.opted_out:
                contact.opted_out, contact.opted_out_at = True, datetime.now(timezone.utc)
            updated += 1
        else:
            skipped += 1
    await db.commit()
    return {"created": created, "updated": updated, "skipped": skipped, "total_rows": len(rows), "errors": errors[:50], "more_errors": max(len(errors) - 50, 0)}


@router.get("/export/csv")
async def export_contacts(q: str | None = None, tag: str | None = None, opted_out: bool | None = None, source: str | None = None,
                          ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> StreamingResponse:
    cond = _filters(ctx.tenant_id, q, tag, opted_out, source)
    rows = (await db.execute(select(Contact).where(*cond).order_by(Contact.created_at))).scalars().all()
    trait_keys = sorted({k for c in rows for k in (c.custom_fields or {})})

    def generate():
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["username", "phone", "name", "email", "tags", "opted_out", "source", "created_at", *trait_keys])
        yield buf.getvalue()
        for c in rows:
            buf.seek(0)
            buf.truncate()
            w.writerow([_safe(f"@{c.ig_username}" if c.ig_username else ""), _safe(f"+{c.phone}" if c.phone else ""), _safe(c.name), _safe(c.email or ""), ";".join(c.tags or []), "yes" if c.opted_out else "no", c.source,
                        c.created_at.isoformat(), *[_safe(str((c.custom_fields or {}).get(k, ""))) for k in trait_keys]])
            yield buf.getvalue()

    return StreamingResponse(generate(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="contacts.csv"'})


def _safe(value: str) -> str:
    """Neutralise CSV formula injection when the export is opened in Excel/Sheets."""
    return "'" + value if value[:1] in {"=", "@", "\t", "\r"} or (value[:1] in {"+", "-"} and not value[1:].replace(" ", "").isdigit()) else value


# ---- bulk ---------------------------------------------------------------------------------------------------------

class BulkBody(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=5000)
    action: Literal["add_tag", "remove_tag", "opt_out", "opt_in", "delete"]
    tag: str | None = None


@router.post("/bulk")
async def bulk(body: BulkBody, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    rows = (await db.execute(select(Contact).where(Contact.tenant_id == ctx.tenant_id, Contact.id.in_(body.ids)))).scalars().all()
    if body.action in {"add_tag", "remove_tag"} and not (body.tag or "").strip():
        raise HTTPException(status_code=422, detail={"error": "Choose a tag."})
    tag = (body.tag or "").strip()[:50]
    now = datetime.now(timezone.utc)
    if body.action == "delete":
        await db.execute(delete(Contact).where(Contact.tenant_id == ctx.tenant_id, Contact.id.in_([c.id for c in rows])))
    else:
        for c in rows:
            if body.action == "add_tag":
                c.tags = _clean_tags([*(c.tags or []), tag])
            elif body.action == "remove_tag":
                c.tags = [t for t in (c.tags or []) if t.lower() != tag.lower()]
            elif body.action == "opt_out":
                c.opted_out, c.opted_out_at = True, now
            elif body.action == "opt_in":
                c.opted_out, c.opted_out_at = False, None
    await db.commit()
    return {"affected": len(rows)}


