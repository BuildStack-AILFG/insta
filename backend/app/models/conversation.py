"""Shared-inbox data: one conversation per (account, contact), many messages per conversation."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Conversation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("account_id", "contact_id", name="uq_conversations_account_contact"),
        Index("ix_conversations_tenant_last_message", "tenant_id", "last_message_at"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True)

    status: Mapped[str] = mapped_column(String(16), default="open")  # open|resolved
    # bot = automations/AI may reply; intervened = a human took over, automation is suppressed.
    inbox_status: Mapped[str] = mapped_column(String(16), default="bot")
    assigned_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    labels: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)

    unread_count: Mapped[int] = mapped_column(Integer, default=0)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_message_preview: Mapped[str | None] = mapped_column(String(300), nullable=True)
    last_inbound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # drives the 24h window


class Message(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
        Index("ix_messages_external_id", "external_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)

    direction: Mapped[str] = mapped_column(String(8), nullable=False)  # in|out
    type: Mapped[str] = mapped_column(String(24), default="text")  # text|image|video|audio|file|story_mention|story_reply|share|reel|postback|quick_reply|buttons|reaction|comment|system
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    media_url: Mapped[str | None] = mapped_column(Text, nullable=True)  # Instagram CDN url (inbound) or the public url we sent
    media_mime: Mapped[str | None] = mapped_column(String(128), nullable=True)
    media_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # structured content (buttons, quick replies, attachment urls, story/reply context…)

    external_id: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Instagram message id (mid)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued|sent|read|failed|received
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    sender_type: Mapped[str] = mapped_column(String(16), default="contact")  # contact|agent|bot|ai|api|flow|comment (a comment automation DM)
    sender_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False)  # private agent note
    callback_data: Mapped[str | None] = mapped_column(String(512), nullable=True)

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
