"""Timestamped behavioural events on a contact (order_placed, cart_abandoned, ...). Feeds event-triggered campaigns and flows."""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ContactEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "contact_events"
    __table_args__ = (Index("ix_contact_events_tenant_name", "tenant_id", "name"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    properties: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    source: Mapped[str] = mapped_column(String(32), default="api")
