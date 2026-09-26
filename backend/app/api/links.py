"""Public redirect for tracked DM links: GET /api/l/{code} counts the click and sends the person on to the real URL."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core import ratelimit
from app.models.tracked_link import TrackedLink
from app.services.instagram import links

router = APIRouter(prefix="/l", tags=["links"])


@router.get("/{code}", include_in_schema=False)
async def follow(code: str, request: Request, db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    link = (await db.execute(select(TrackedLink).where(TrackedLink.code == code[:24]))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail={"error": "This link doesn't exist."})
    # Link previews and repeat taps shouldn't be able to inflate counts endlessly; the redirect itself always works.
    if ratelimit.allow(f"link:{code}:{request.client.host if request.client else ''}", 5, 60):
        await links.record_click(db, link)
    return RedirectResponse(link.url, status_code=302, headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
