"""WhatsApp Commerce: commerce settings, products (catalog) and orders

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-25 12:00:00

Adds the tables behind the WhatsApp Commerce section: one settings row per workspace, a product catalog, and an order panel.
Prices are integers in the currency's minor unit (paise for INR), matching app/services/plan_catalog.py.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "commerce_settings",
        sa.Column("tenant_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("catalog_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cart_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("meta_catalog_id", sa.String(length=64), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("checkout_mode", sa.String(length=16), nullable=False, server_default="manual"),
        sa.Column("external_checkout_url", sa.Text(), nullable=True),
        sa.Column("config", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("tenant_id"),
    )

    op.create_table(
        "products",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("retailer_id", sa.String(length=80), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("category", sa.String(length=120), nullable=True),
        sa.Column("availability", sa.String(length=16), nullable=False, server_default="in_stock"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("meta_product_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "retailer_id", name="uq_product_tenant_retailer"),
    )
    op.create_index("ix_products_tenant_id", "products", ["tenant_id"])

    op.create_table(
        "commerce_orders",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_number", sa.String(length=24), nullable=False),
        sa.Column("contact_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("customer_name", sa.String(length=200), nullable=True),
        sa.Column("customer_phone", sa.String(length=32), nullable=True),
        sa.Column("items", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("subtotal", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="INR"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("payment_status", sa.String(length=16), nullable=False, server_default="unpaid"),
        sa.Column("payment_method", sa.String(length=24), nullable=True),
        sa.Column("shipping_address", sa.JSON(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="whatsapp"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_commerce_orders_tenant_id", "commerce_orders", ["tenant_id"])
    op.create_index("ix_commerce_orders_status", "commerce_orders", ["status"])


def downgrade() -> None:
    op.drop_index("ix_commerce_orders_status", table_name="commerce_orders")
    op.drop_index("ix_commerce_orders_tenant_id", table_name="commerce_orders")
    op.drop_table("commerce_orders")
    op.drop_index("ix_products_tenant_id", table_name="products")
    op.drop_table("products")
    op.drop_table("commerce_settings")
