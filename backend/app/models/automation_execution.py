"""One run of a published flow for one contact. Supports waits (resumed by the scheduler) and a step-by-step audit trail."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AutomationExecution(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "automation_executions"
    __table_args__ = (Index("ix_automation_exec_status_wait", "status", "wait_until"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    flow_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("automation_flows.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True)

    status: Mapped[str] = mapped_column(String(16), default="running")  # running|waiting|completed|failed|cancelled
    current_node: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # waiting_for: null | "time" | "reply". A "reply" wait resumes when the contact's next inbound message arrives.
    waiting_for: Mapped[str | None] = mapped_column(String(16), nullable=True)
    wait_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    context: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # variables captured during the run
    events: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{at, node, type, detail}]
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
