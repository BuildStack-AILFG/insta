"""
Comment automations: "someone comments <keyword> on <post> -> reply publicly and send them a DM".
Every comment Instagram delivers is logged in instagram_comments, whether or not an automation fired, so the dashboard can
show what happened (and so Meta's at-least-once webhook retries are processed exactly once).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class CommentAutomation(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "comment_automations"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|paused

    # Which posts: all | specific (media_ids) | next (the next post published after the automation is created) | live (Instagram Live comments).
    media_scope: Mapped[str] = mapped_column(String(16), default="specific")
    media_ids: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    # Snapshot of the chosen posts for display: [{id, caption, thumbnail_url, permalink}]
    media_preview: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # Trigger: match "any" comment, or keywords with contains/exact matching.
    match_type: Mapped[str] = mapped_column(String(16), default="contains")  # any|contains|exact
    keywords: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    exclude_keywords: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)

    # Public reply under the comment; one variant is picked at random so replies don't look robotic.
    public_reply_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    public_replies: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)

    # Private DM (Meta allows exactly one private reply per comment, within 7 days of the comment).
    dm_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    dm_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Optional A/B test: when set, each person consistently gets variant A (dm_text) or B (this), and results are compared.
    dm_text_b: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Up to 3 link buttons shown under the DM: [{title, url}]
    dm_buttons: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # Optionally continue the conversation in a published flow once the person replies.
    flow_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("automation_flows.id", ondelete="SET NULL"), nullable=True)

    # Fire at most once per commenter per automation (people often comment the keyword several times).
    once_per_user: Mapped[bool] = mapped_column(Boolean, default=True)

    # Unlock gate: the DM above is only delivered once the person passes it.
    #   none   — send the DM straight away
    #   follow — first DM asks them to tap a button; the link is sent once they follow the account
    #   email / phone — first DM asks for it; the link is sent once a valid answer arrives
    gate: Mapped[str] = mapped_column(String(16), default="none")
    gate_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    gate_button: Mapped[str] = mapped_column(String(20), nullable=False, default="")  # follow gate: the tap-to-unlock button label
    gate_retry_text: Mapped[str] = mapped_column(Text, nullable=False, default="")  # not following yet / invalid answer
    # Rewrite DM link buttons through our redirect so clicks are counted per person.
    track_clicks: Mapped[bool] = mapped_column(Boolean, default=True)
    # Nudge people who got the link but didn't open it — only while Instagram's 24h reply window is open.
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    reminder_after_minutes: Mapped[int] = mapped_column(Integer, default=120)
    reminder_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    reminders_sent: Mapped[int] = mapped_column(Integer, default=0)

    # Counters (denormalised for the list view).
    comments_matched: Mapped[int] = mapped_column(Integer, default=0)
    public_replies_sent: Mapped[int] = mapped_column(Integer, default=0)
    dms_sent: Mapped[int] = mapped_column(Integer, default=0)
    gates_passed: Mapped[int] = mapped_column(Integer, default=0)
    link_clicks: Mapped[int] = mapped_column(Integer, default=0)  # unique people who clicked a DM link
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class InstagramComment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "instagram_comments"
    __table_args__ = (
        Index("ix_instagram_comments_tenant_created", "tenant_id", "created_at"),
        Index("ix_instagram_comments_automation_author", "automation_id", "from_ig_id"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False)
    comment_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    parent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    media_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    media_product_type: Mapped[str | None] = mapped_column(String(16), nullable=True)  # FEED|REELS|AD|LIVE
    from_ig_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    from_username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_live: Mapped[bool] = mapped_column(Boolean, default=False)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)

    # What automation did with it.
    automation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("comment_automations.id", ondelete="SET NULL"), nullable=True)
    outcome: Mapped[str] = mapped_column(String(24), default="no_match")  # no_match|matched|skipped_repeat|own_comment|moderated|failed
    moderation: Mapped[str | None] = mapped_column(String(16), nullable=True)  # hidden|deleted (by a rule or a person)
    moderation_reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    public_reply_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dm_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)


class CommentGate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A commenter who still has to pass an automation's unlock gate (follow / email / phone) to get the link."""

    __tablename__ = "comment_gates"
    __table_args__ = (UniqueConstraint("automation_id", "contact_id", name="uq_comment_gates_automation_contact"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    automation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("comment_automations.id", ondelete="CASCADE"), nullable=False)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # follow|email|phone
    status: Mapped[str] = mapped_column(String(16), default="waiting")  # waiting|passed|abandoned
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    passed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Giveaway(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Pick random winners from the comments on one post, with entry rules."""

    __tablename__ = "giveaways"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    media_id: Mapped[str] = mapped_column(String(64), nullable=False)
    media_preview: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Entry rules.
    keyword: Mapped[str] = mapped_column(String(60), nullable=False, default="")  # comment must contain it (empty = any comment)
    min_mentions: Mapped[int] = mapped_column(Integer, default=0)  # "tag 2 friends"
    unique_users: Mapped[bool] = mapped_column(Boolean, default=True)  # one entry per person however many times they comment
    exclude_usernames: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    winners_count: Mapped[int] = mapped_column(Integer, default=1)

    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft|drawn
    comments_total: Mapped[int] = mapped_column(Integer, default=0)
    entries_count: Mapped[int] = mapped_column(Integer, default=0)
    # [{comment_id, ig_id, username, text, notified, error}]
    winners: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    drawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notify_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
