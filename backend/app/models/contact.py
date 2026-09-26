"""
Contact — one row per (tenant, Instagram user). Instagram identifies people by an app-scoped IGSID; phone/email are optional
details collected later (lead capture, integrations, manual entry).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Contact(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "contacts"
    __table_args__ = (
        UniqueConstraint("tenant_id", "ig_user_id", name="uq_contacts_tenant_ig_user"),
        UniqueConstraint("tenant_id", "phone", name="uq_contacts_tenant_phone"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Instagram-scoped user id (IGSID) — the identity every DM/comment webhook carries.
    ig_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ig_username: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    profile_pic_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    follower_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_follower: Mapped[bool | None] = mapped_column(Boolean, nullable=True)  # does this person follow the business account
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)

    tags: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    custom_fields: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    source: Mapped[str] = mapped_column(String(32), default="manual")  # instagram|comment|story|ads|manual|api|webhook
    ad_attribution: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    opted_out: Mapped[bool] = mapped_column(Boolean, default=False)
    opted_out_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    last_contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
