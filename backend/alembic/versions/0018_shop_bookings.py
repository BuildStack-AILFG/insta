"""Shop bookings: date-and-time requests from hotel / venue storefronts

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-18 12:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shop_bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("shop_products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("service_name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False, server_default="event"),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("event_time", sa.String(32), nullable=False, server_default=""),
        sa.Column("check_out_date", sa.Date(), nullable=True),
        sa.Column("guests", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("event_type", sa.String(40), nullable=False, server_default=""),
        sa.Column("customer_name", sa.String(120), nullable=False),
        sa.Column("customer_phone", sa.String(32), nullable=False),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("tenant_id", "number", name="uq_shop_bookings_tenant_number"),
    )
    op.create_index("ix_shop_bookings_tenant_created", "shop_bookings", ["tenant_id", "created_at"])


def downgrade() -> None:
    op.drop_table("shop_bookings")
