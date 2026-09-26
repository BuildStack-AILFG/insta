"""Posts, reels, carousels and stories scheduled for publishing through the Instagram Content Publishing API."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ScheduledPost(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "scheduled_posts"
    __table_args__ = (Index("ix_scheduled_posts_due", "status", "scheduled_at"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # image|carousel|reel|story
    caption: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # [{url, type: image|video}] — public https URLs Instagram downloads the files from.
    media: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    first_comment: Mapped[str] = mapped_column(Text, nullable=False, default="")
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    # scheduled -> processing (containers created, videos uploading) -> published | failed; cancelled by a person.
    status: Mapped[str] = mapped_column(String(16), default="scheduled")
    container_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    child_container_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    ig_media_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    permalink: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
