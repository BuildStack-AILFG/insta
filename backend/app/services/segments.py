"""Segments: turn a saved rule set into a SQL filter on contacts."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, exists, func, not_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.models.contact import Contact
from app.models.contact_event import ContactEvent

FIELDS = {"tag", "name", "phone", "email", "source", "opted_out", "created_after", "created_before", "last_contacted_before", "never_contacted"}
OPS = {"eq", "neq", "contains", "not_contains", "has", "not_has", "exists", "not_exists", "gt", "lt", "is_true", "is_false"}


class SegmentError(ValueError):
    pass


def _date(value: Any) -> datetime:
    try:
        d = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise SegmentError(f"'{value}' is not a valid date (use YYYY-MM-DD).") from exc
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def rule_clause(tenant_id: uuid.UUID, rule: dict) -> ColumnElement:
    field, op, value = rule.get("field", ""), rule.get("op", "eq"), rule.get("value")
    if op not in OPS:
        raise SegmentError(f"Unknown operator '{op}'.")

    if field == "tag":
        clause = Contact.tags.any(str(value))
        return not_(clause) if op in {"not_has", "neq", "not_contains"} else clause
    if field in {"name", "phone", "email", "source"}:
        col = getattr(Contact, field)
        v = str(value or "")
        return {"eq": col == v, "neq": col != v, "contains": col.ilike(f"%{v}%"), "not_contains": not_(col.ilike(f"%{v}%")),
                "exists": col.is_not(None), "not_exists": col.is_(None)}.get(op, col == v)
    if field == "opted_out":
        return Contact.opted_out.is_(op == "is_true" or str(value).lower() in {"true", "1", "yes"})
    if field == "created_after":
        return Contact.created_at >= _date(value)
    if field == "created_before":
        return Contact.created_at <= _date(value)
    if field == "last_contacted_before":
        return or_(Contact.last_contacted_at.is_(None), Contact.last_contacted_at <= _date(value))
    if field == "never_contacted":
        return Contact.last_contacted_at.is_(None)
    if field.startswith("trait:"):
        col = Contact.custom_fields[field[6:]].as_string()
        v = str(value or "")
        return {"eq": col == v, "neq": or_(col.is_(None), col != v), "contains": col.ilike(f"%{v}%"), "not_contains": or_(col.is_(None), not_(col.ilike(f"%{v}%"))),
                "exists": col.is_not(None), "not_exists": col.is_(None)}.get(op, col == v)
    if field.startswith("event:"):
        clause = exists().where(ContactEvent.contact_id == Contact.id, ContactEvent.tenant_id == tenant_id, ContactEvent.name == field[6:])
        return not_(clause) if op in {"not_exists", "not_has"} else clause
    raise SegmentError(f"Unknown field '{field}'.")


def build_filter(tenant_id: uuid.UUID, filters: dict) -> ColumnElement:
    rules = (filters or {}).get("rules") or []
    if not rules:
        return Contact.tenant_id == tenant_id
    clauses = [rule_clause(tenant_id, r) for r in rules]
    joined = or_(*clauses) if (filters or {}).get("match") == "any" else and_(*clauses)
    return and_(Contact.tenant_id == tenant_id, joined)


def validate_filters(filters: dict) -> None:
    for r in (filters or {}).get("rules", []):
        rule_clause(uuid.UUID(int=0), r)  # raises SegmentError on bad field/op/date


async def count_matching(db: AsyncSession, tenant_id: uuid.UUID, filters: dict, *, include_opted_out: bool = False) -> int:
    q = select(func.count()).select_from(Contact).where(build_filter(tenant_id, filters))
    if not include_opted_out:
        q = q.where(Contact.opted_out.is_(False))
    return (await db.execute(q)).scalar_one()
