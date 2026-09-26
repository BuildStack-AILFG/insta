"""comment automation unlock gates (follow / email / phone) and DM link click tracking

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-26 16:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("comment_automations", sa.Column("gate", sa.String(16), nullable=False, server_default="none"))
    op.add_column("comment_automations", sa.Column("gate_prompt", sa.Text(), nullable=False, server_default=""))
    op.add_column("comment_automations", sa.Column("gate_button", sa.String(20), nullable=False, server_default=""))
    op.add_column("comment_automations", sa.Column("gate_retry_text", sa.Text(), nullable=False, server_default=""))
    op.add_column("comment_automations", sa.Column("track_clicks", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("comment_automations", sa.Column("gates_passed", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("comment_automations", sa.Column("link_clicks", sa.Integer(), nullable=False, server_default="0"))

    op.create_table(
        "comment_gates",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("automation_id", UUID, sa.ForeignKey("comment_automations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_id", UUID, sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="waiting"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("passed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("automation_id", "contact_id", name="uq_comment_gates_automation_contact"),
    )
    op.create_index("ix_comment_gates_tenant_id", "comment_gates", ["tenant_id"])
    op.create_index("ix_comment_gates_contact_id", "comment_gates", ["contact_id"])

    op.create_table(
        "tracked_links",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(24), nullable=False, unique=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("source", sa.String(24), nullable=False),
        sa.Column("automation_id", UUID, sa.ForeignKey("comment_automations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("flow_id", UUID, sa.ForeignKey("automation_flows.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contact_id", UUID, sa.ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("label", sa.String(100), nullable=True),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("first_clicked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_clicked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_tracked_links_tenant_id", "tracked_links", ["tenant_id"])
    op.create_index("ix_tracked_links_automation_id", "tracked_links", ["automation_id"])


def downgrade() -> None:
    op.drop_table("tracked_links")
    op.drop_table("comment_gates")
    for col in ("link_clicks", "gates_passed", "track_clicks", "gate_retry_text", "gate_button", "gate_prompt", "gate"):
        op.drop_column("comment_automations", col)
