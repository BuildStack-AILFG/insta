"""
Sales pipeline: ordered stages, deals that move through them, an activity trail and the numbers for reports.
A stage is `open`, `won` or `lost`; a deal's status follows the kind of the stage it sits in, so dragging a card into
"Won" closes it and dragging it back re-opens it.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.contact import Contact
from app.models.pipeline import Deal, DealActivity, PipelineStage
from app.models.tenant import Tenant, TenantMembership, User
from app.services import outbound_webhooks

DEFAULT_STAGES = [
    ("New lead", "#38bdf8", "open", 10), ("Contacted", "#a78bfa", "open", 25), ("Qualified", "#fbbf24", "open", 50),
    ("Proposal sent", "#fb923c", "open", 75), ("Won", "#22c55e", "won", 100), ("Lost", "#ef4444", "lost", 0),
]
KINDS = ("open", "won", "lost")
MAX_STAGES = 12
COLUMN_LIMIT = 100  # cards shown per stage on the board (the header still counts all of them)


class PipelineError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message, self.status = message, status


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---- stages -------------------------------------------------------------------------------------------------------

async def ensure_stages(db: AsyncSession, tenant_id: uuid.UUID) -> list[PipelineStage]:
    stages = await list_stages(db, tenant_id)
    if stages:
        return stages
    for i, (name, color, kind, prob) in enumerate(DEFAULT_STAGES):
        db.add(PipelineStage(tenant_id=tenant_id, name=name, position=i, color=color, kind=kind, probability=prob))
    await db.commit()
    return await list_stages(db, tenant_id)


async def list_stages(db: AsyncSession, tenant_id: uuid.UUID) -> list[PipelineStage]:
    return list((await db.execute(select(PipelineStage).where(PipelineStage.tenant_id == tenant_id).order_by(PipelineStage.position, PipelineStage.created_at))).scalars().all())


def _check_stage_fields(name: str | None, color: str | None, kind: str | None, probability: int | None) -> None:
    if name is not None and not (1 <= len(name.strip()) <= 80):
        raise PipelineError("Stage name is required (max 80 characters).")
    if color is not None and not (len(color) in (4, 7) and color.startswith("#")):
        raise PipelineError("Stage colour must be a hex value like #22c55e.")
    if kind is not None and kind not in KINDS:
        raise PipelineError("Stage type must be open, won or lost.")
    if probability is not None and not (0 <= probability <= 100):
        raise PipelineError("Win probability must be between 0 and 100.")


async def add_stage(db: AsyncSession, tenant_id: uuid.UUID, *, name: str, color: str = "#64748b", kind: str = "open", probability: int = 0) -> PipelineStage:
    _check_stage_fields(name, color, kind, probability)
    stages = await ensure_stages(db, tenant_id)
    if len(stages) >= MAX_STAGES:
        raise PipelineError(f"A pipeline can have at most {MAX_STAGES} stages.", 409)
    # new open stages slot in before the first closed stage so the board still ends in Won / Lost
    idx = next((i for i, s in enumerate(stages) if s.kind != "open"), len(stages)) if kind == "open" else len(stages)
    stage = PipelineStage(tenant_id=tenant_id, name=name.strip(), color=color, kind=kind, probability=100 if kind == "won" else 0 if kind == "lost" else probability, position=idx)
    stages.insert(idx, stage)
    db.add(stage)
    for i, s in enumerate(stages):
        s.position = i
    await db.commit()
    return stage


async def update_stage(db: AsyncSession, tenant_id: uuid.UUID, stage_id: uuid.UUID, **fields) -> PipelineStage:
    stage = await _stage(db, tenant_id, stage_id)
    _check_stage_fields(fields.get("name"), fields.get("color"), fields.get("kind"), fields.get("probability"))
    new_kind = fields.get("kind")
    if new_kind and new_kind != stage.kind:
        stages = await list_stages(db, tenant_id)
        if sum(1 for s in stages if s.kind == stage.kind) <= 1 and stage.kind != "open":
            raise PipelineError(f"Keep at least one '{stage.kind}' stage.")
        if sum(1 for s in stages if s.kind == "open") <= 1 and stage.kind == "open":
            raise PipelineError("Keep at least one open stage.")
        deals = (await db.execute(select(Deal).where(Deal.stage_id == stage.id))).scalars().all()
        for d in deals:  # deals follow the stage's new meaning
            _apply_kind(d, new_kind)
    for k in ("name", "color", "kind", "probability"):
        if fields.get(k) is not None:
            setattr(stage, k, fields[k].strip() if k == "name" else fields[k])
    if stage.kind == "won":
        stage.probability = 100
    elif stage.kind == "lost":
        stage.probability = 0
    await db.commit()
    return stage


async def reorder_stages(db: AsyncSession, tenant_id: uuid.UUID, ids: list[uuid.UUID]) -> list[PipelineStage]:
    stages = await list_stages(db, tenant_id)
    if {s.id for s in stages} != set(ids) or len(ids) != len(stages):
        raise PipelineError("Send every stage id exactly once.")
    by_id = {s.id: s for s in stages}
    for i, sid in enumerate(ids):
        by_id[sid].position = i
    await db.commit()
    return await list_stages(db, tenant_id)


async def delete_stage(db: AsyncSession, tenant_id: uuid.UUID, stage_id: uuid.UUID, move_to: uuid.UUID | None) -> None:
    stage = await _stage(db, tenant_id, stage_id)
    stages = await list_stages(db, tenant_id)
    if len(stages) <= 2 or sum(1 for s in stages if s.kind == stage.kind) <= 1:
        raise PipelineError("A pipeline needs at least one open, one won and one lost stage.")
    count = (await db.execute(select(func.count()).select_from(Deal).where(Deal.stage_id == stage.id))).scalar_one()
    if count:
        if move_to is None:
            raise PipelineError(f"This stage has {count} deal{'s' if count != 1 else ''}. Choose where to move them first.", 409)
        target = await _stage(db, tenant_id, move_to)
        if target.id == stage.id:
            raise PipelineError("Choose a different stage to move the deals to.")
        deals = (await db.execute(select(Deal).where(Deal.stage_id == stage.id))).scalars().all()
        base = (await db.execute(select(func.coalesce(func.max(Deal.position), -1)).where(Deal.stage_id == target.id))).scalar_one() + 1
        for i, d in enumerate(deals):
            d.stage_id, d.position = target.id, base + i
            _apply_kind(d, target.kind)
    await db.flush()
    await db.delete(stage)
    await db.commit()


async def _stage(db: AsyncSession, tenant_id: uuid.UUID, stage_id: uuid.UUID) -> PipelineStage:
    stage = await db.get(PipelineStage, stage_id)
    if stage is None or stage.tenant_id != tenant_id:
        raise PipelineError("Stage not found.", 404)
    return stage


# ---- deals --------------------------------------------------------------------------------------------------------

def _apply_kind(deal: Deal, kind: str) -> None:
    if kind == "open":
        deal.status, deal.closed_at, deal.lost_reason = "open", None, None
    else:
        deal.status = kind
        deal.closed_at = deal.closed_at or utcnow()
        if kind == "won":
            deal.lost_reason = None


_last_ts = datetime.min.replace(tzinfo=timezone.utc)


def _strictly_increasing_now() -> datetime:
    """Activities written back to back must sort in the order they happened, even on clocks that tick coarsely (Windows)."""
    global _last_ts
    now = utcnow()
    _last_ts = now if now > _last_ts else _last_ts + timedelta(microseconds=1)
    return _last_ts


async def _activity(db: AsyncSession, deal: Deal, kind: str, user_id: uuid.UUID | None, **data) -> None:
    # explicit timestamp: now() is fixed for the whole transaction, which would leave same-move entries in arbitrary order
    db.add(DealActivity(tenant_id=deal.tenant_id, deal_id=deal.id, user_id=user_id, kind=kind, data=data, created_at=_strictly_increasing_now()))


def _event_payload(deal: Deal) -> dict:
    return {"deal_id": str(deal.id), "title": deal.title, "value": deal.value, "currency": deal.currency, "status": deal.status,
            "stage_id": str(deal.stage_id), "contact_id": str(deal.contact_id) if deal.contact_id else None}


async def _validate_refs(db: AsyncSession, tenant_id: uuid.UUID, contact_id: uuid.UUID | None, owner_user_id: uuid.UUID | None) -> None:
    if contact_id is not None:
        c = await db.get(Contact, contact_id)
        if c is None or c.tenant_id != tenant_id:
            raise PipelineError("Contact not found.", 404)
    if owner_user_id is not None:
        ok = (await db.execute(select(TenantMembership.id).where(TenantMembership.tenant_id == tenant_id, TenantMembership.user_id == owner_user_id))).first()
        if not ok:
            raise PipelineError("That person isn't on this workspace.")


async def create_deal(db: AsyncSession, tenant_id: uuid.UUID, *, title: str, stage_id: uuid.UUID | None = None, contact_id: uuid.UUID | None = None, value: int = 0,
                      currency: str = "INR", owner_user_id: uuid.UUID | None = None, source: str = "manual", expected_close: date | None = None,
                      notes: str | None = None, user_id: uuid.UUID | None = None) -> Deal:
    title = (title or "").strip()
    if not title:
        raise PipelineError("Give the deal a title.")
    if value < 0:
        raise PipelineError("Deal value can't be negative.")
    await _validate_refs(db, tenant_id, contact_id, owner_user_id)
    stages = await ensure_stages(db, tenant_id)
    stage = next((s for s in stages if s.id == stage_id), None) if stage_id else next(s for s in stages if s.kind == "open")
    if stage is None:
        raise PipelineError("Stage not found.", 404)
    position = (await db.execute(select(func.coalesce(func.max(Deal.position), -1)).where(Deal.stage_id == stage.id))).scalar_one() + 1
    deal = Deal(tenant_id=tenant_id, contact_id=contact_id, stage_id=stage.id, owner_user_id=owner_user_id, title=title[:200], value=value, currency=(currency or "INR").upper()[:8],
                position=position, source=source, expected_close=expected_close, notes=(notes or None))
    _apply_kind(deal, stage.kind)
    db.add(deal)
    await db.flush()
    await _activity(db, deal, "created", user_id, stage=stage.name, source=source)
    await db.commit()
    await db.refresh(deal)
    await outbound_webhooks.emit(tenant_id, "deal_created", _event_payload(deal))
    return deal


async def get_deal(db: AsyncSession, tenant_id: uuid.UUID, deal_id: uuid.UUID) -> Deal:
    deal = await db.get(Deal, deal_id)
    if deal is None or deal.tenant_id != tenant_id:
        raise PipelineError("Deal not found.", 404)
    return deal


async def update_deal(db: AsyncSession, deal: Deal, *, user_id: uuid.UUID | None, fields: dict) -> Deal:
    changes: dict = {}
    if fields.get("title") is not None:
        title = (fields["title"] or "").strip()
        if not title:
            raise PipelineError("Give the deal a title.")
        changes["title"] = (deal.title, title[:200])
        deal.title = title[:200]
    if fields.get("value") is not None:
        if fields["value"] < 0:
            raise PipelineError("Deal value can't be negative.")
        if fields["value"] != deal.value:
            changes["value"] = (deal.value, fields["value"])
        deal.value = fields["value"]
    if "currency" in fields and fields["currency"]:
        deal.currency = fields["currency"].upper()[:8]
    if "contact_id" in fields or "owner_user_id" in fields:
        await _validate_refs(db, deal.tenant_id, fields.get("contact_id"), fields.get("owner_user_id"))
    if "contact_id" in fields:
        deal.contact_id = fields["contact_id"]
    if "owner_user_id" in fields:
        if fields["owner_user_id"] != deal.owner_user_id:
            changes["owner"] = (str(deal.owner_user_id) if deal.owner_user_id else None, str(fields["owner_user_id"]) if fields["owner_user_id"] else None)
        deal.owner_user_id = fields["owner_user_id"]
    if "expected_close" in fields:
        deal.expected_close = fields["expected_close"]
    if "notes" in fields:
        deal.notes = fields["notes"] or None
    if "lost_reason" in fields and deal.status == "lost":
        deal.lost_reason = (fields["lost_reason"] or "").strip()[:200] or None
    if changes:
        await _activity(db, deal, "updated", user_id, changes={k: {"from": a, "to": b} for k, (a, b) in changes.items()})
    await db.commit()
    await db.refresh(deal)
    return deal


async def move_deal(db: AsyncSession, deal: Deal, stage_id: uuid.UUID, *, position: int | None = None, user_id: uuid.UUID | None = None, lost_reason: str | None = None) -> Deal:
    """Drop a deal into a stage at `position` (0-based; None = bottom) and renumber the column."""
    target = await _stage(db, deal.tenant_id, stage_id)
    old_stage = await db.get(PipelineStage, deal.stage_id)
    was = deal.status
    column = list((await db.execute(select(Deal).where(Deal.stage_id == target.id, Deal.id != deal.id).order_by(Deal.position, Deal.created_at))).scalars().all())
    idx = len(column) if position is None else max(0, min(position, len(column)))
    column.insert(idx, deal)
    deal.stage_id = target.id
    _apply_kind(deal, target.kind)
    if target.kind == "lost" and lost_reason:
        deal.lost_reason = lost_reason.strip()[:200] or None
    for i, d in enumerate(column):
        d.position = i
    if old_stage is not None and old_stage.id != target.id:
        await _activity(db, deal, "stage_changed", user_id, **{"from": old_stage.name, "to": target.name})
        if target.kind == "won":
            await _activity(db, deal, "won", user_id, value=deal.value)
        elif target.kind == "lost":
            await _activity(db, deal, "lost", user_id, reason=deal.lost_reason)
        elif was != "open":
            await _activity(db, deal, "reopened", user_id)
    await db.commit()
    await db.refresh(deal)
    if old_stage is not None and old_stage.id != target.id:
        event = "deal_won" if target.kind == "won" else "deal_lost" if target.kind == "lost" else "deal_stage_changed"
        await outbound_webhooks.emit(deal.tenant_id, event, {**_event_payload(deal), "from_stage": old_stage.name, "to_stage": target.name})
    return deal


async def add_note(db: AsyncSession, deal: Deal, text: str, user_id: uuid.UUID | None) -> None:
    text = (text or "").strip()
    if not text:
        raise PipelineError("Write a note first.")
    await _activity(db, deal, "note", user_id, text=text[:2000])
    await db.commit()


async def delete_deal(db: AsyncSession, deal: Deal) -> None:
    await db.delete(deal)
    await db.commit()


async def auto_deal_for_contact(db: AsyncSession, tenant_id: uuid.UUID, contact: Contact) -> Deal | None:
    """New Instagram contact -> a deal in the first stage, when the workspace turned that on."""
    tenant = await db.get(Tenant, tenant_id)
    cfg = (tenant.settings or {}).get("pipeline") if tenant else None
    if not cfg or not cfg.get("auto_create"):
        return None
    return await create_deal(db, tenant_id, title=contact.name if not contact.name.startswith("+") else f"Lead {contact.phone}", contact_id=contact.id, value=int(cfg.get("default_value") or 0),
                             currency=cfg.get("currency") or "INR", source="instagram")


async def deal_for_contact(db: AsyncSession, tenant_id: uuid.UUID, contact_id: uuid.UUID) -> Deal | None:
    """The contact's most recent open deal (what flows and payment links act on)."""
    return (await db.execute(select(Deal).where(Deal.tenant_id == tenant_id, Deal.contact_id == contact_id, Deal.status == "open").order_by(Deal.created_at.desc()).limit(1))).scalar_one_or_none()


# ---- serialisation & queries --------------------------------------------------------------------------------------

def stage_out(s: PipelineStage) -> dict:
    return {"id": str(s.id), "name": s.name, "position": s.position, "color": s.color, "kind": s.kind, "probability": s.probability}


def deal_out(d: Deal, contact: Contact | None = None, owner: User | None = None) -> dict:
    return {"id": str(d.id), "title": d.title, "value": d.value, "currency": d.currency, "status": d.status, "stage_id": str(d.stage_id), "position": d.position, "source": d.source,
            "contact_id": str(d.contact_id) if d.contact_id else None, "contact_name": contact.name if contact else None, "contact_phone": contact.phone if contact else None,
            "owner_user_id": str(d.owner_user_id) if d.owner_user_id else None, "owner_name": (owner.full_name or owner.email) if owner else None,
            "expected_close": d.expected_close.isoformat() if d.expected_close else None, "lost_reason": d.lost_reason, "notes": d.notes,
            "closed_at": d.closed_at.isoformat() if d.closed_at else None, "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None}


async def _hydrate(db: AsyncSession, deals: list[Deal]) -> list[dict]:
    cids = {d.contact_id for d in deals if d.contact_id}
    uids = {d.owner_user_id for d in deals if d.owner_user_id}
    contacts = {c.id: c for c in (await db.execute(select(Contact).where(Contact.id.in_(cids)))).scalars().all()} if cids else {}
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    return [deal_out(d, contacts.get(d.contact_id), users.get(d.owner_user_id)) for d in deals]


def _filters(tenant_id: uuid.UUID, owner: uuid.UUID | None, q: str | None, contact_id: uuid.UUID | None = None) -> list:
    conds = [Deal.tenant_id == tenant_id]
    if owner:
        conds.append(Deal.owner_user_id == owner)
    if contact_id:
        conds.append(Deal.contact_id == contact_id)
    if q and q.strip():
        like = f"%{q.strip().replace('%', '').replace('_', '')}%"
        conds.append(or_(Deal.title.ilike(like), Deal.contact_id.in_(select(Contact.id).where(Contact.tenant_id == tenant_id, or_(Contact.name.ilike(like), Contact.phone.ilike(like))))))
    return conds


async def board(db: AsyncSession, tenant_id: uuid.UUID, owner: uuid.UUID | None = None, q: str | None = None) -> dict:
    stages = await ensure_stages(db, tenant_id)
    conds = _filters(tenant_id, owner, q)
    totals = {row.stage_id: row for row in (await db.execute(select(Deal.stage_id, func.count().label("n"), func.coalesce(func.sum(Deal.value), 0).label("v")).where(*conds).group_by(Deal.stage_id))).all()}
    out = []
    for s in stages:
        rows = list((await db.execute(select(Deal).where(*conds, Deal.stage_id == s.id).order_by(Deal.position, Deal.created_at.desc()).limit(COLUMN_LIMIT))).scalars().all())
        t = totals.get(s.id)
        out.append({**stage_out(s), "count": t.n if t else 0, "value": int(t.v) if t else 0, "deals": await _hydrate(db, rows)})
    return {"stages": out}


async def list_deals(db: AsyncSession, tenant_id: uuid.UUID, *, status: str | None, owner: uuid.UUID | None, q: str | None, contact_id: uuid.UUID | None, limit: int, offset: int) -> dict:
    conds = _filters(tenant_id, owner, q, contact_id)
    if status:
        conds.append(Deal.status == status)
    total = (await db.execute(select(func.count()).select_from(Deal).where(*conds))).scalar_one()
    rows = list((await db.execute(select(Deal).where(*conds).order_by(Deal.updated_at.desc()).limit(limit).offset(offset))).scalars().all())
    return {"total": total, "items": await _hydrate(db, rows)}


async def deal_detail(db: AsyncSession, deal: Deal) -> dict:
    out = (await _hydrate(db, [deal]))[0]
    acts = list((await db.execute(select(DealActivity).where(DealActivity.deal_id == deal.id).order_by(DealActivity.created_at.desc()).limit(100))).scalars().all())
    uids = {a.user_id for a in acts if a.user_id}
    names = {u.id: (u.full_name or u.email) for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    out["activity"] = [{"id": str(a.id), "kind": a.kind, "data": a.data, "user": names.get(a.user_id), "created_at": a.created_at.isoformat()} for a in acts]
    return out


async def report(db: AsyncSession, tenant_id: uuid.UUID, days: int) -> dict:
    days = max(1, min(days, 365))
    since = utcnow() - timedelta(days=days)
    stages = await ensure_stages(db, tenant_id)
    prob = {s.id: s.probability for s in stages}

    open_rows = (await db.execute(select(Deal.stage_id, Deal.value, Deal.currency).where(Deal.tenant_id == tenant_id, Deal.status == "open"))).all()
    open_value = sum(v for _, v, _ in open_rows)
    weighted = sum(v * prob.get(sid, 0) / 100 for sid, v, _ in open_rows)

    closed = list((await db.execute(select(Deal).where(Deal.tenant_id == tenant_id, Deal.status.in_(("won", "lost")), Deal.closed_at >= since))).scalars().all())
    won = [d for d in closed if d.status == "won"]
    lost = [d for d in closed if d.status == "lost"]
    created = (await db.execute(select(func.count()).select_from(Deal).where(Deal.tenant_id == tenant_id, Deal.created_at >= since))).scalar_one()
    cycle = [(d.closed_at - d.created_at).total_seconds() / 86400 for d in won if d.closed_at and d.created_at]

    per_day: dict[str, dict] = {}
    for i in range(days):
        day = (since + timedelta(days=i + 1)).date().isoformat()
        per_day[day] = {"date": day, "won_value": 0, "won_count": 0}
    for d in won:
        key = d.closed_at.date().isoformat()
        if key in per_day:
            per_day[key]["won_value"] += d.value
            per_day[key]["won_count"] += 1

    counts = {row.stage_id: row.n for row in (await db.execute(select(Deal.stage_id, func.count().label("n")).where(Deal.tenant_id == tenant_id, Deal.created_at >= since).group_by(Deal.stage_id))).all()}
    by_owner: dict[str, dict] = {}
    for d in won:
        key = str(d.owner_user_id) if d.owner_user_id else "unassigned"
        row = by_owner.setdefault(key, {"user_id": None if key == "unassigned" else key, "won_count": 0, "won_value": 0})
        row["won_count"] += 1
        row["won_value"] += d.value
    uids = [uuid.UUID(k) for k in by_owner if k != "unassigned"]
    names = {str(u.id): (u.full_name or u.email) for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    for k, row in by_owner.items():
        row["name"] = names.get(k, "Unassigned")

    reasons: dict[str, int] = {}
    for d in lost:
        reasons[d.lost_reason or "No reason given"] = reasons.get(d.lost_reason or "No reason given", 0) + 1
    sources: dict[str, int] = {}
    for d in won:
        sources[d.source] = sources.get(d.source, 0) + 1

    decided = len(won) + len(lost)
    won_value = sum(d.value for d in won)
    return {
        "days": days, "open": {"count": len(open_rows), "value": open_value, "weighted": int(weighted)},
        "created": created, "won": {"count": len(won), "value": won_value, "avg_value": int(won_value / len(won)) if won else 0},
        "lost": {"count": len(lost), "value": sum(d.value for d in lost)}, "win_rate": round(len(won) / decided * 100, 1) if decided else None,
        "avg_cycle_days": round(sum(cycle) / len(cycle), 1) if cycle else None, "series": list(per_day.values()),
        "funnel": [{"stage": s.name, "color": s.color, "kind": s.kind, "count": counts.get(s.id, 0)} for s in stages],
        "by_owner": sorted(by_owner.values(), key=lambda r: -r["won_value"]),
        "lost_reasons": sorted(({"reason": k, "count": v} for k, v in reasons.items()), key=lambda r: -r["count"])[:8],
        "won_sources": sorted(({"source": k, "count": v} for k, v in sources.items()), key=lambda r: -r["count"]),
    }
