from __future__ import annotations

import uuid

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Segment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Saved audience filter. `filters` = {match: all|any, rules: [{field, op, value}]}, evaluated in app/services/segments.py."""

    __tablename__ = "segments"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    filters: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
