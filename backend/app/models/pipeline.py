"""Sales pipeline: stages, deals and an activity trail (drives the kanban board and sales reports)."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import JSON, BigInteger, Date, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class PipelineStage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "pipeline_stages"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#64748b")
    kind: Mapped[str] = mapped_column(String(8), nullable=False, default="open")  # open|won|lost
    probability: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # 0-100, used for the weighted forecast


class Deal(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "deals"
    __table_args__ = (Index("ix_deals_tenant_stage", "tenant_id", "stage_id", "position"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    stage_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("pipeline_stages.id"), nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    value: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)  # smallest currency unit
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")
    status: Mapped[str] = mapped_column(String(8), nullable=False, default="open")  # open|won|lost
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # order within the stage column
    source: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")  # manual|instagram|flow|api
    expected_close: Mapped[date | None] = mapped_column(Date, nullable=True)
    lost_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class DealActivity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "deal_activities"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    deal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    kind: Mapped[str] = mapped_column(String(24), nullable=False)  # created|stage_changed|note|won|lost|reopened|payment
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
