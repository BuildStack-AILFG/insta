"""
Media library: store uploaded images and videos so scheduled posts don't need an external CDN.

Instagram's Content Publishing API downloads every file from a public URL, so each upload gets an unguessable file name
and is served without login at {PUBLIC_BASE_URL}/api/files/{file_name}. Images are normalised to what Instagram accepts
(JPEG, sRGB, upright, at most 1440px wide and 8 MB); videos (MP4 / MOV) are stored as uploaded.

Files live on local disk under MEDIA_DIR — see lib/PHASES.md for when to move them to object storage.
"""

from __future__ import annotations

import asyncio
import io
import os
import secrets
import tempfile
import uuid
from pathlib import Path
from typing import BinaryIO

from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.media_asset import MediaAsset

BACKEND_ROOT = Path(__file__).resolve().parents[2]
MAX_IMAGE_UPLOAD = 30 * 1024 * 1024  # before conversion
MAX_IMAGE_STORED = 8 * 1024 * 1024  # Instagram's image limit
MAX_VIDEO = 300 * 1024 * 1024  # Instagram's reel limit
MAX_IMAGE_WIDTH = 1440
MAX_PIXELS = 60_000_000
# Feed photos (and carousel photos) must be between 4:5 portrait and 1.91:1 landscape; stories and reels take anything.
MIN_FEED_RATIO, MAX_FEED_RATIO = 0.8, 1.91
_CHUNK = 1024 * 1024

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class MediaError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message = message
        self.status = status


def media_root() -> Path:
    root = Path(get_settings().media_dir)
    return root if root.is_absolute() else BACKEND_ROOT / root


def file_path(asset: MediaAsset) -> Path:
    return media_root() / str(asset.tenant_id) / asset.file_name


def file_url(file_name: str, base: str | None = None) -> str:
    """Public URL Instagram downloads the file from. `base` (the request's own origin) is only a fallback for local dev."""
    root = (get_settings().public_base_url or base or "").rstrip("/")
    return f"{root}/api/files/{file_name}"


def publicly_reachable() -> bool:
    return get_settings().public_base_url.startswith("https://")


def _sniff(head: bytes) -> tuple[str, str, str] | None:
    """(kind, content_type, extension) from a file's first bytes — the browser's claimed type isn't trusted."""
    if head.startswith(b"\xff\xd8\xff"):
        return "image", "image/jpeg", "jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image", "image/png", "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image", "image/webp", "webp"
    if head[4:8] == b"ftyp":
        return ("video", "video/quicktime", "mov") if head[8:12] == b"qt  " else ("video", "video/mp4", "mp4")
    return None


def _to_instagram_jpeg(raw: bytes) -> tuple[bytes, int, int]:
    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise MediaError("That image couldn't be read. Try a JPEG or PNG.") from exc
    if img.mode in ("RGBA", "LA", "P"):
        rgba = img.convert("RGBA")
        img = Image.new("RGB", rgba.size, (255, 255, 255))
        img.paste(rgba, mask=rgba.getchannel("A"))
    elif img.mode != "RGB":
        img = img.convert("RGB")
    if img.width > MAX_IMAGE_WIDTH:
        img = img.resize((MAX_IMAGE_WIDTH, round(img.height * MAX_IMAGE_WIDTH / img.width)), Image.Resampling.LANCZOS)
    for quality in (90, 82, 72, 60):
        out = io.BytesIO()
        img.save(out, "JPEG", quality=quality, optimize=True, progressive=True)
        if out.tell() <= MAX_IMAGE_STORED:
            return out.getvalue(), img.width, img.height
    raise MediaError("That image is too large even after compressing it. Try a smaller one.")


async def used_bytes(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return int((await db.execute(select(func.coalesce(func.sum(MediaAsset.size), 0)).where(MediaAsset.tenant_id == tenant_id))).scalar_one())


def quota_bytes() -> int:
    return get_settings().media_quota_mb * 1024 * 1024


async def _read_capped(src: BinaryIO, limit: int, sink: BinaryIO) -> int:
    total = 0
    while chunk := await asyncio.to_thread(src.read, _CHUNK):
        total += len(chunk)
        if total > limit:
            raise MediaError(f"That file is too large — the limit is {limit // (1024 * 1024)} MB.", 413)
        await asyncio.to_thread(sink.write, chunk)
    return total


async def store(db: AsyncSession, *, tenant_id: uuid.UUID, user_id: uuid.UUID | None, name: str, src: BinaryIO) -> MediaAsset:
    """Validate, normalise and save one upload. The caller commits."""
    head = await asyncio.to_thread(src.read, 16)
    sniffed = _sniff(head)
    if sniffed is None:
        raise MediaError("Upload a JPEG, PNG or WebP image, or an MP4 / MOV video.", 415)
    kind, content_type, ext = sniffed

    target_dir = media_root() / str(tenant_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    width = height = None
    if kind == "image":
        buf = io.BytesIO()
        buf.write(head)
        await _read_capped(src, MAX_IMAGE_UPLOAD - len(head), buf)
        data, width, height = await asyncio.to_thread(_to_instagram_jpeg, buf.getvalue())
        content_type, ext, size = "image/jpeg", "jpg", len(data)
        file_name = f"{secrets.token_urlsafe(18)}.{ext}"
        if await used_bytes(db, tenant_id) + size > quota_bytes():
            raise MediaError("Your media library is full. Delete files you no longer need.", 413)
        await asyncio.to_thread((target_dir / file_name).write_bytes, data)
    else:
        file_name = f"{secrets.token_urlsafe(18)}.{ext}"
        fd, tmp = tempfile.mkstemp(dir=target_dir, suffix=".part")
        try:
            with os.fdopen(fd, "wb") as out:
                out.write(head)
                size = len(head) + await _read_capped(src, MAX_VIDEO - len(head), out)
            if await used_bytes(db, tenant_id) + size > quota_bytes():
                raise MediaError("Your media library is full. Delete files you no longer need.", 413)
            os.replace(tmp, target_dir / file_name)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)

    asset = MediaAsset(tenant_id=tenant_id, uploaded_by=user_id, kind=kind, name=(name or f"upload.{ext}")[:255], file_name=file_name,
                       content_type=content_type, size=size, width=width, height=height)
    db.add(asset)
    return asset


def remove_file(asset: MediaAsset) -> None:
    try:
        file_path(asset).unlink(missing_ok=True)
    except OSError:
        pass
