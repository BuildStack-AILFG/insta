"""Merge-field substitution for message text: {{name}}, {{first_name}}, {{username}}, {{phone}}, {{email}}, {{trait.key}}, {{var.key}}."""

from __future__ import annotations

import re
from typing import Any

from app.models.contact import Contact

_FIELD = re.compile(r"\{\{\s*([a-zA-Z_][\w.\-]*)\s*\}\}")


def contact_values(contact: Contact, ctx: dict[str, Any] | None = None) -> dict[str, str]:
    name = contact.name or ""
    values: dict[str, str] = {
        "name": name,
        "first_name": name.split(" ")[0].lstrip("@") if name and not name.startswith(("+", "Instagram user")) else "",
        "username": f"@{contact.ig_username}" if contact.ig_username else "",
        "phone": contact.phone or "",
        "email": contact.email or "",
    }
    for k, v in (contact.custom_fields or {}).items():
        values[f"trait.{k}"] = str(v)
    for k, v in (ctx or {}).items():
        values[f"var.{k}"] = str(v)
    return values


def render(text: str | None, contact: Contact, ctx: dict[str, Any] | None = None, fallback: str = "") -> str:
    if not text:
        return ""
    values = contact_values(contact, ctx)

    def sub(match: re.Match) -> str:
        return values.get(match.group(1)) or fallback

    return _FIELD.sub(sub, text)


def resolve_field(contact: Contact, source: str) -> str | None:
    """Resolve 'name' | 'phone' | 'email' | 'trait:city' to a value for template variable mapping."""
    if source.startswith("trait:"):
        v = (contact.custom_fields or {}).get(source[6:])
        return None if v in (None, "") else str(v)
    v = {"name": contact.name, "first_name": (contact.name or "").split(" ")[0], "phone": contact.phone, "email": contact.email}.get(source)
    return v or None
