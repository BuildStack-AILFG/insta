"""Growth tools: ig.me ref links (with QR codes) that start a conversation, and a link-in-bio page."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class RefLink(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """https://ig.me/m/{username}?ref={ref} — opening it starts a DM and fires the configured welcome."""

    __tablename__ = "ref_links"
    __table_args__ = (UniqueConstraint("account_id", "ref", name="uq_ref_links_account_ref"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    ref: Mapped[str] = mapped_column(String(60), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    buttons: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # [{title, url}]
    tag: Mapped[str] = mapped_column(String(50), nullable=False, default="")
    flow_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("automation_flows.id", ondelete="SET NULL"), nullable=True)
    opens: Mapped[int] = mapped_column(Integer, default=0)
    people: Mapped[int] = mapped_column(Integer, default=0)  # unique people who opened it
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BioPage(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A public link-in-bio page: /b/{slug}."""

    __tablename__ = "bio_pages"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False)
    slug: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    bio: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # [{title, url, clicks}]
    links: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Optional "DM me" button that opens an ig.me ref link (so the welcome automation runs).
    dm_button_text: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    dm_ref_link_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("ref_links.id", ondelete="SET NULL"), nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=True)
    views: Mapped[int] = mapped_column(Integer, default=0)
