"""Raw inbound webhook log: gives idempotency (by event key) and a debugging trail."""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class WebhookIngress(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "webhook_ingress"

    tenant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(24), default="instagram")
    event_key: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)  # e.g. ig:msg:<mid> | ig:postback:<mid>
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    processed: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
