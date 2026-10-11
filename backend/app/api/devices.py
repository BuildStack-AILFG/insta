from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db
from app.models.device_token import DeviceToken

router = APIRouter(prefix="/devices", tags=["devices"])


class DeviceIn(BaseModel):
    token: str = Field(min_length=10, max_length=255, pattern=r"^(ExponentPushToken|ExpoPushToken)\[.+\]$")
    platform: Literal["android", "ios"] = "android"


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def register(body: DeviceIn, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> Response:
    """Called by the mobile app after sign-in. A phone has one token: whoever signed in last on it gets its pushes."""
    row = (await db.execute(select(DeviceToken).where(DeviceToken.token == body.token))).scalar_one_or_none()
    if row is None:
        row = DeviceToken(token=body.token)
        db.add(row)
    row.tenant_id, row.user_id, row.platform, row.last_seen_at = ctx.tenant_id, ctx.user_id, body.platform, datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


class DeviceOut(BaseModel):
    token: str


@router.post("/unregister", status_code=status.HTTP_204_NO_CONTENT)
async def unregister(body: DeviceOut, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> Response:
    """Sign-out on the phone: stop pushing this workspace's events to it."""
    await db.execute(delete(DeviceToken).where(DeviceToken.token == body.token, DeviceToken.user_id == ctx.user_id))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
