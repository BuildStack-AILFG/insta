"""A connected Instagram professional (Business/Creator) account. The long-lived access token is encrypted at rest."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class InstagramAccount(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "instagram_accounts"
    __table_args__ = (UniqueConstraint("ig_user_id", name="uq_instagram_accounts_ig_user_id"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    # The professional account id Meta puts in webhook `entry.id` and in `recipient.id` of DMs (GET /me?fields=user_id).
    ig_user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # The app-scoped id returned as `id` by GET /me — only used for display/debugging.
    app_scoped_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    account_type: Mapped[str | None] = mapped_column(String(32), nullable=True)  # BUSINESS|MEDIA_CREATOR
    profile_picture_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    followers_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    media_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    access_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    # Long-lived tokens last 60 days; the scheduler refreshes them well before this.
    token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scopes: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    webhooks_subscribed: Mapped[bool] = mapped_column(Boolean, default=False)

    connection_type: Mapped[str] = mapped_column(String(16), default="oauth")  # oauth|manual
    status: Mapped[str] = mapped_column(String(16), default="connected")  # connected|error|disconnected
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_webhook_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # ice_breakers[], notices[] — read as one blob.
    settings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
