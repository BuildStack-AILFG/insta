"""Shop categories: a list the seller manages (add, rename, pick products), independent of the products in it

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-16 12:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shop_categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_shop_categories_tenant_id", "shop_categories", ["tenant_id"])
    op.create_index("uq_shop_categories_tenant_name", "shop_categories", ["tenant_id", sa.text("lower(name)")], unique=True)
    # Categories sellers already typed into products become real categories (one per name, first spelling wins).
    op.execute(
        "INSERT INTO shop_categories (id, tenant_id, name) "
        "SELECT gen_random_uuid(), tenant_id, min(category) FROM shop_products WHERE category <> '' GROUP BY tenant_id, lower(category)"
    )


def downgrade() -> None:
    op.drop_table("shop_categories")
