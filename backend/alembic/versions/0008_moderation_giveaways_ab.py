"""comment moderation, giveaways and A/B DM variants

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-26 18:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("comment_automations", sa.Column("dm_text_b", sa.Text(), nullable=False, server_default=""))
    op.add_column("tracked_links", sa.Column("variant", sa.String(1), nullable=True))
    op.add_column("instagram_comments", sa.Column("moderation", sa.String(16), nullable=True))
    op.add_column("instagram_comments", sa.Column("moderation_reason", sa.String(120), nullable=True))

    op.create_table(
        "giveaways",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID, sa.ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("media_id", sa.String(64), nullable=False),
        sa.Column("media_preview", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("keyword", sa.String(60), nullable=False, server_default=""),
        sa.Column("min_mentions", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unique_users", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("exclude_usernames", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("winners_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
        sa.Column("comments_total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("entries_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("winners", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("drawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notify_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("notified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_giveaways_tenant_id", "giveaways", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("giveaways")
    op.drop_column("instagram_comments", "moderation_reason")
    op.drop_column("instagram_comments", "moderation")
    op.drop_column("tracked_links", "variant")
    op.drop_column("comment_automations", "dm_text_b")
