"""Unauthenticated endpoints: public plan catalogue, QR codes (e.g. for ig.me links) and a health probe."""

from __future__ import annotations

import io
import json
import logging

import segno
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.plan import Plan
from app.services import entitlements
from app.services.plan_catalog import FEATURES

log = logging.getLogger(__name__)
router = APIRouter(prefix="/public", tags=["public"])

@router.get("/plans")
async def public_plans(db: AsyncSession = Depends(get_db)) -> Response:
    """The price list for the marketing site, straight from the plans table so admin edits show up without a redeploy."""
    rows = (await db.execute(select(Plan).where(Plan.is_public.is_(True)))).scalars().all()
    trial = await db.get(Plan, "trial")
    body = {
        "plans": [{"id": p.id, "name": p.name, "per_month": {"monthly": p.price_monthly, "quarterly": p.price_quarterly, "yearly": p.price_yearly},
                   "quotas": p.quotas or {}, "features": entitlements.features_of(p)} for p in sorted(rows, key=lambda p: (p.price_monthly is None, p.price_monthly or 0))],
        "trial": {"days": await entitlements.trial_days(db), "quotas": (trial.quotas if trial else {}) or {}, "features": entitlements.features_of(trial)},
        "feature_catalog": FEATURES,
    }
    return Response(json.dumps(body), media_type="application/json", headers={"Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*"})


@router.get("/qr")
async def qr(text: str = Query(min_length=4, max_length=500), scale: int = Query(8, ge=2, le=20), dark: str = Query("#000000", pattern="^#[0-9a-fA-F]{6}$")) -> Response:
    """QR code (SVG) for an ig.me link or any http(s) URL."""
    if not text.startswith(("https://", "http://")):
        raise HTTPException(status_code=422, detail={"error": "QR text must be an http(s) URL."})
    buf = io.BytesIO()
    segno.make(text, error="m").save(buf, kind="svg", scale=scale, border=2, dark=dark, xmldecl=False, svgns=True)
    return Response(buf.getvalue(), media_type="image/svg+xml", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/health", response_class=PlainTextResponse)
async def health() -> str:
    return "ok"
