"""Billing: platform subscription payments (Razorpay orders) and per-workspace customer payment links."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Payment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One plan purchase. Amounts are in the smallest currency unit (paise)."""

    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("razorpay_order_id", name="uq_payments_order"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id: Mapped[str] = mapped_column(String(32), nullable=False)
    interval: Mapped[str] = mapped_column(String(16), nullable=False)  # monthly|quarterly|yearly
    months: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="INR")

    base_amount: Mapped[int] = mapped_column(Integer, nullable=False)     # price for the period, before credit and tax
    credit_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # unused value of the previous paid plan
    gst_amount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_amount: Mapped[int] = mapped_column(Integer, nullable=False)    # what the customer pays

    razorpay_order_id: Mapped[str] = mapped_column(String(64), nullable=False)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
    method: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="created")  # created|paid|failed

    invoice_number: Mapped[str | None] = mapped_column(String(32), nullable=True, unique=True)
    invoice_seq: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    profile_snapshot: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # billing details as they were at purchase (for the invoice)


class PaymentLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A Razorpay payment link a workspace sent to one of its own customers."""

    __tablename__ = "payment_links"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    razorpay_link_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    reference_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    short_url: Mapped[str] = mapped_column(String(500), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # paise
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="created")  # created|paid|cancelled|expired
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
