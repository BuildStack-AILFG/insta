"""Media library: images and videos uploaded to GramForGrow, served publicly so Instagram can download them for publishing."""

from __future__ import annotations

import uuid

from sqlalchemy import BigInteger, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class MediaAsset(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "media_assets"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    kind: Mapped[str] = mapped_column(String(8), nullable=False)  # image|video
    name: Mapped[str] = mapped_column(String(255), nullable=False)  # original file name, for people
    # Unguessable public file name ({token}.{ext}); the file is served at /api/files/{file_name}.
    file_name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
