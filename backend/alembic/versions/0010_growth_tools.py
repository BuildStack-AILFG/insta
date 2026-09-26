"""growth tools: ig.me ref links, link-in-bio pages, click reminders

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-27 10:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def _ts() -> list[sa.Column]:
    return [sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade() -> None:
    op.add_column("comment_automations", sa.Column("reminder_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("comment_automations", sa.Column("reminder_after_minutes", sa.Integer(), nullable=False, server_default="120"))
    op.add_column("comment_automations", sa.Column("reminder_text", sa.Text(), nullable=False, server_default=""))
    op.add_column("comment_automations", sa.Column("reminders_sent", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("tracked_links", sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "ref_links",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID, sa.ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("ref", sa.String(60), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("buttons", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("tag", sa.String(50), nullable=False, server_default=""),
        sa.Column("flow_id", UUID, sa.ForeignKey("automation_flows.id", ondelete="SET NULL"), nullable=True),
        sa.Column("opens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("people", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_opened_at", sa.DateTime(timezone=True), nullable=True),
        *_ts(),
        sa.UniqueConstraint("account_id", "ref", name="uq_ref_links_account_ref"),
    )
    op.create_index("ix_ref_links_tenant_id", "ref_links", ["tenant_id"])

    op.create_table(
        "bio_pages",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID, sa.ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slug", sa.String(40), nullable=False, unique=True),
        sa.Column("title", sa.String(100), nullable=False, server_default=""),
        sa.Column("bio", sa.Text(), nullable=False, server_default=""),
        sa.Column("links", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("dm_button_text", sa.String(40), nullable=False, server_default=""),
        sa.Column("dm_ref_link_id", UUID, sa.ForeignKey("ref_links.id", ondelete="SET NULL"), nullable=True),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("views", sa.Integer(), nullable=False, server_default="0"),
        *_ts(),
    )
    op.create_index("ix_bio_pages_tenant_id", "bio_pages", ["tenant_id"])


def downgrade() -> None:
    op.drop_table("bio_pages")
    op.drop_table("ref_links")
    op.drop_column("tracked_links", "reminded_at")
    for col in ("reminders_sent", "reminder_text", "reminder_after_minutes", "reminder_enabled"):
        op.drop_column("comment_automations", col)
