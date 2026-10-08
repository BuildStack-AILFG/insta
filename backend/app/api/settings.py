"""
Workspace settings (tenants.settings JSON). Each top-level key is validated and replaced wholesale; keys the server owns
(AI credentials/usage, round-robin cursor) can't be written from here.
"""

from __future__ import annotations

import re
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Ctx, get_ctx, get_db
from app.models.tenant import Tenant
from app.services.entitlements import ensure_feature
from app.services.assignment import MODES

router = APIRouter(prefix="/settings", tags=["settings"])

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
SERVER_OWNED = {"ai", "ai_usage", "notices", "billing"}
WRITER_KEYS = {"quick_replies"}  # anyone who can reply can manage canned replies; everything else is manager-only


class SettingsOut(BaseModel):
    settings: dict


class SettingsPatch(BaseModel):
    settings: dict


def _bad(msg: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"error": msg})


def _bool(v, name: str) -> bool:
    if not isinstance(v, bool):
        raise _bad(f"'{name}' must be true or false.")
    return v


def _auto_replies(v) -> dict:
    if not isinstance(v, dict):
        raise _bad("auto_replies must be an object.")
    out: dict = {}
    for kind in ("welcome", "away", "delayed"):
        entry = v.get(kind) or {}
        msg = str(entry.get("message", ""))[:1000]
        item = {"enabled": _bool(entry.get("enabled", False), f"{kind}.enabled"), "message": msg}
        if kind == "delayed":
            try:
                item["minutes"] = max(1, min(int(entry.get("minutes", 5)), 1440))
            except (TypeError, ValueError):
                raise _bad("Delayed reply minutes must be a number.")
        if item["enabled"] and not msg.strip():
            raise _bad(f"Write the {kind} message before turning it on.")
        out[kind] = item
    for kind in ("story_mention", "story_reply"):  # thank people who mention you / reply to your stories
        entry = v.get(kind) or {}
        msg = str(entry.get("message", ""))[:1000]
        item = {"enabled": _bool(entry.get("enabled", False), f"{kind}.enabled"), "message": msg,
                "link_title": str(entry.get("link_title") or "").strip()[:20], "link_url": str(entry.get("link_url") or "").strip()[:2000],
                "tag": str(entry.get("tag") or "").strip()[:50]}
        if item["link_url"] and not item["link_url"].startswith(("http://", "https://")):
            raise _bad("The story reply button link must start with https://")
        if bool(item["link_title"]) != bool(item["link_url"]):
            raise _bad("Give the story reply button both a label and a link, or neither.")
        if item["enabled"] and not msg.strip():
            raise _bad(f"Write the {kind.replace('_', ' ')} message before turning it on.")
        out[kind] = item
    return out


def _moderation(v) -> dict:
    if not isinstance(v, dict):
        raise _bad("moderation must be an object.")
    keywords = v.get("keywords") or []
    if not isinstance(keywords, list):
        raise _bad("moderation.keywords must be a list.")
    try:
        max_mentions = max(0, min(int(v.get("max_mentions") or 0), 50))
    except (TypeError, ValueError):
        raise _bad("moderation.max_mentions must be a number.")
    action = v.get("action", "hide")
    if action not in {"hide", "delete"}:
        raise _bad("moderation.action must be hide or delete.")
    return {
        "enabled": _bool(v.get("enabled", False), "moderation.enabled"),
        "keywords": sorted({str(k).strip()[:60] for k in keywords if str(k).strip()})[:200],
        "hide_links": _bool(v.get("hide_links", False), "moderation.hide_links"),
        "max_mentions": max_mentions,
        "use_ai": _bool(v.get("use_ai", False), "moderation.use_ai"),
        "action": action,
    }


def _business_hours(v) -> dict:
    if not isinstance(v, dict):
        raise _bad("business_hours must be an object.")
    tz = str(v.get("timezone") or "UTC")
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError):
        raise _bad(f"Unknown timezone '{tz}'.")
    days = {}
    for d in DAYS:
        e = (v.get("days") or {}).get(d) or {}
        start, end = str(e.get("start", "09:00")), str(e.get("end", "18:00"))
        if not HHMM.match(start) or not HHMM.match(end) or start >= end:
            raise _bad(f"Business hours for {d.upper()} need a valid start before the end (HH:MM).")
        days[d] = {"enabled": _bool(e.get("enabled", False), f"{d}.enabled"), "start": start, "end": end}
    return {"timezone": tz, "days": days}


def _assignment(v, current: dict) -> dict:
    if not isinstance(v, dict) or v.get("mode") not in MODES:
        raise _bad(f"Assignment mode must be one of: {', '.join(sorted(MODES))}.")
    exclude = []
    for u in v.get("exclude", []):
        try:
            exclude.append(str(uuid.UUID(str(u))))
        except ValueError:
            raise _bad("Invalid team member in assignment exclusions.")
    return {"mode": v["mode"], "exclude": exclude, "cursor": int((current or {}).get("cursor", 0))}


def _quick_replies(v) -> list:
    if not isinstance(v, list) or len(v) > 100:
        raise _bad("quick_replies must be a list of up to 100 items.")
    out = []
    for i in v:
        shortcut, text = str((i or {}).get("shortcut", "")).strip().lstrip("/")[:30], str((i or {}).get("text", "")).strip()[:1000]
        if not shortcut or not text:
            raise _bad("Every quick reply needs a shortcut and text.")
        out.append({"id": str((i or {}).get("id") or uuid.uuid4()), "shortcut": shortcut, "text": text})
    return out


def _country(v) -> str:
    digits = re.sub(r"\D", "", str(v or ""))
    if len(digits) > 4:
        raise _bad("Country code should be 1-4 digits (e.g. 91).")
    return digits


def _ai_agents(v) -> dict:
    if not isinstance(v, dict):
        raise _bad("ai_agents must be an object.")
    return {str(k)[:40]: bool(x) for k, x in v.items()}


def _pipeline(v) -> dict:
    if not isinstance(v, dict):
        raise _bad("pipeline must be an object.")
    out = {"auto_create": _bool(v.get("auto_create", False), "auto_create"), "currency": str(v.get("currency") or "INR").upper()[:3]}
    try:
        out["default_value"] = max(0, min(int(v.get("default_value") or 0), 10**12))
    except (TypeError, ValueError):
        raise _bad("Default deal value must be a number.")
    return out


def validate(patch: dict, current: dict) -> dict:
    out: dict = {}
    for key, value in patch.items():
        if key in SERVER_OWNED:
            raise _bad(f"'{key}' can't be changed here.")
        if key == "auto_replies":
            out[key] = _auto_replies(value)
        elif key == "moderation":
            out[key] = _moderation(value)
        elif key == "business_hours":
            out[key] = _business_hours(value)
        elif key == "assignment":
            out[key] = _assignment(value, current.get("assignment") or {})
        elif key == "quick_replies":
            out[key] = _quick_replies(value)
        elif key == "default_country_code":
            out[key] = _country(value)
        elif key in {"custom_replies_enabled", "intent_matching_enabled"}:
            out[key] = _bool(value, key)
        elif key == "ai_agents":
            out[key] = _ai_agents(value)
        elif key == "pipeline":
            out[key] = _pipeline(value)
        else:
            raise _bad(f"Unknown setting '{key}'.")
    return out


def public_view(settings: dict) -> dict:
    return {k: v for k, v in (settings or {}).items() if k not in SERVER_OWNED}


@router.get("", response_model=SettingsOut)
async def get_settings(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> SettingsOut:
    tenant = await db.get(Tenant, ctx.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Workspace not found."})
    return SettingsOut(settings=public_view(tenant.settings))


@router.patch("", response_model=SettingsOut)
async def patch_settings(body: SettingsPatch, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> SettingsOut:
    if not set(body.settings) <= WRITER_KEYS and not ctx.is_manager:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Only workspace owners and admins can change these settings."})
    if ctx.role == "viewer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Your role is read-only."})
    if "assignment" in body.settings:
        await ensure_feature(db, ctx.tenant_id, "assignment_rules")
    if body.settings.get("intent_matching_enabled") is True:
        await ensure_feature(db, ctx.tenant_id, "intent_matching")
    tenant = await db.get(Tenant, ctx.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Workspace not found."})
    tenant.settings = {**(tenant.settings or {}), **validate(body.settings, tenant.settings or {})}
    flag_modified(tenant, "settings")
    await db.commit()
    return SettingsOut(settings=public_view(tenant.settings))
