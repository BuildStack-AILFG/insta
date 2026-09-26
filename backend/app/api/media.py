"""Media library: upload images and videos once, then use them in scheduled posts. Files are served publicly for Instagram."""

from __future__ import annotations

import re
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import Text, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.core import ratelimit
from app.models.media_asset import MediaAsset
from app.models.scheduled_post import ScheduledPost
from app.services import media_library as lib

router = APIRouter(prefix="/media", tags=["media"])
files = APIRouter(prefix="/files", tags=["media"])

MAX_FILES_PER_UPLOAD = 10
_FILE_NAME = re.compile(r"^[A-Za-z0-9_-]{16,40}\.(jpg|png|webp|mp4|mov)$")


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def asset_out(a: MediaAsset, base: str | None = None) -> dict:
    return {"id": str(a.id), "kind": a.kind, "name": a.name, "url": lib.file_url(a.file_name, base), "file_name": a.file_name,
            "content_type": a.content_type, "size": a.size, "width": a.width, "height": a.height, "created_at": _iso(a.created_at)}


def _base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


async def _owned(db: AsyncSession, ctx: Ctx, asset_id: uuid.UUID) -> MediaAsset:
    a = await db.get(MediaAsset, asset_id)
    if a is None or a.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "File not found."})
    return a


@router.get("")
async def list_media(request: Request, kind: Literal["image", "video"] | None = None, limit: int = Query(60, ge=1, le=200), offset: int = Query(0, ge=0),
                     ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    q = select(MediaAsset).where(MediaAsset.tenant_id == ctx.tenant_id)
    if kind:
        q = q.where(MediaAsset.kind == kind)
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(q.order_by(MediaAsset.created_at.desc()).limit(limit).offset(offset))).scalars().all()
    base = _base(request)
    return {"items": [asset_out(a, base) for a in rows], "total": total, "used_bytes": await lib.used_bytes(db, ctx.tenant_id),
            "quota_bytes": lib.quota_bytes(), "publicly_reachable": lib.publicly_reachable()}


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload(request: Request, files_: list[UploadFile] = File(..., alias="files"), ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> list[dict]:
    ratelimit.limit(request, "media-upload", 60, 3600, extra=str(ctx.tenant_id))
    if not 1 <= len(files_) <= MAX_FILES_PER_UPLOAD:
        raise HTTPException(status_code=422, detail={"error": f"Upload 1 to {MAX_FILES_PER_UPLOAD} files at a time."})
    saved: list[MediaAsset] = []
    try:
        for f in files_:
            try:
                asset = await lib.store(db, tenant_id=ctx.tenant_id, user_id=ctx.user_id, name=f.filename or "", src=f.file)
            except lib.MediaError as exc:
                raise HTTPException(status_code=exc.status, detail={"error": f"{f.filename or 'File'}: {exc.message}"}) from exc
            saved.append(asset)
            await db.flush()  # so the next file's quota check counts this one
        await db.commit()
    except BaseException:
        await db.rollback()
        for a in saved:
            lib.remove_file(a)
        raise
    base = _base(request)
    return [asset_out(a, base) for a in saved]


async def _in_use(db: AsyncSession, asset: MediaAsset) -> bool:
    return (await db.execute(select(ScheduledPost.id).where(
        ScheduledPost.tenant_id == asset.tenant_id, ScheduledPost.status.in_(("scheduled", "processing")),
        cast(ScheduledPost.media, Text).contains(str(asset.id))).limit(1))).first() is not None


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete(asset_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    a = await _owned(db, ctx, asset_id)
    if await _in_use(db, a):
        raise HTTPException(status_code=409, detail={"error": "A scheduled post uses this file. Change or cancel that post first."})
    await db.delete(a)
    await db.commit()
    lib.remove_file(a)


@files.get("/{file_name}", include_in_schema=False)
async def serve(file_name: str, db: AsyncSession = Depends(get_db)) -> FileResponse:
    """Public, unguessable URL — Instagram downloads scheduled files from here."""
    if not _FILE_NAME.match(file_name):
        raise HTTPException(status_code=404, detail={"error": "Not found."})
    a = (await db.execute(select(MediaAsset).where(MediaAsset.file_name == file_name))).scalar_one_or_none()
    path = lib.file_path(a) if a else None
    if a is None or not path.is_file():
        raise HTTPException(status_code=404, detail={"error": "Not found."})
    return FileResponse(path, media_type=a.content_type, headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"})
