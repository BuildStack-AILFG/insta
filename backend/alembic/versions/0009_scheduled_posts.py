"""scheduled posts (content publishing)

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-26 20:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "scheduled_posts",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID, sa.ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("caption", sa.Text(), nullable=False, server_default=""),
        sa.Column("media", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("first_comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="scheduled"),
        sa.Column("container_id", sa.String(64), nullable=True),
        sa.Column("child_container_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ig_media_id", sa.String(64), nullable=True),
        sa.Column("permalink", sa.Text(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_scheduled_posts_tenant_id", "scheduled_posts", ["tenant_id"])
    op.create_index("ix_scheduled_posts_due", "scheduled_posts", ["status", "scheduled_at"])


def downgrade() -> None:
    op.drop_table("scheduled_posts")
