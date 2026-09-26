"""
Unified flow/automation engine — see the plan file's system design §4.8/§7
(deliberately one engine, not the reference product's two). MVP scope only:
the graph CRUD + publish lifecycle. Execution (automation_executions) is a
later phase once there's a webhook pipeline to drive it.
"""

from __future__ import annotations

import uuid

from sqlalchemy import JSON, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class AutomationFlow(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "automation_flows"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    trigger_type: Mapped[str] = mapped_column(String(32), nullable=False, default="incoming_message")
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft|published|archived

    graph: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # {nodes:[...], edges:[...]}
    published_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=0)

    conversations_sent: Mapped[int] = mapped_column(Integer, default=0)
