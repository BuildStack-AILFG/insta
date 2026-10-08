"""Instagram Shop: storefront, products & variants, orders, chat carts, and comment-to-checkout on comment automations

Revision ID: 0013
Revises: 0012
Create Date: 2026-10-08 12:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0013"
down_revision: Union[str, None] = "0012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def _timestamps() -> list[sa.Column]:
    return [sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False)]


def upgrade() -> None:
    op.create_table(
        "shops",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("account_id", UUID, sa.ForeignKey("instagram_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("slug", sa.String(40), nullable=False, unique=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("tagline", sa.String(300), nullable=False, server_default=""),
        sa.Column("logo_url", sa.Text(), nullable=True),
        sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("online_payments", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("cod_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("shipping_fee", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("free_shipping_above", sa.Integer(), nullable=True),
        sa.Column("support_phone", sa.String(32), nullable=False, server_default=""),
        sa.Column("confirmation_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("chat_orders", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("cod_confirmation", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reminders_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("reminder_after_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("reminder_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("gstin", sa.String(15), nullable=False, server_default=""),
        sa.Column("legal_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("business_address", sa.Text(), nullable=False, server_default=""),
        sa.Column("gst_rate", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("invoice_seq", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("order_seq", sa.Integer(), nullable=False, server_default="1000"),
        sa.Column("views", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
    )

    op.create_table(
        "shop_products",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("compare_at_price", sa.Integer(), nullable=True),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("media_id", sa.String(64), nullable=True),
        sa.Column("permalink", sa.String(500), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("stock", sa.Integer(), nullable=True),
        sa.Column("options", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("orders_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("revenue", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
        sa.UniqueConstraint("tenant_id", "media_id", name="uq_shop_products_tenant_media"),
    )

    op.create_table(
        "shop_variants",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", UUID, sa.ForeignKey("shop_products.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("key", sa.String(200), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("options", sa.JSON(), nullable=False),
        sa.Column("price", sa.Integer(), nullable=True),
        sa.Column("stock", sa.Integer(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sort", sa.Integer(), nullable=False, server_default="0"),
        *_timestamps(),
        sa.UniqueConstraint("product_id", "key", name="uq_shop_variants_product_key"),
    )

    op.create_table(
        "shop_orders",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("access_token", sa.String(48), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("subtotal", sa.Integer(), nullable=False),
        sa.Column("shipping", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(8), nullable=False, server_default="INR"),
        sa.Column("customer_name", sa.String(120), nullable=False),
        sa.Column("customer_phone", sa.String(32), nullable=False),
        sa.Column("customer_email", sa.String(255), nullable=True),
        sa.Column("address", sa.JSON(), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("contact_id", UUID, sa.ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("source", sa.String(16), nullable=False, server_default="store"),
        sa.Column("automation_id", UUID, sa.ForeignKey("comment_automations.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("payment_method", sa.String(8), nullable=False),
        sa.Column("payment_status", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("payment_link_id", UUID, sa.ForeignKey("payment_links.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("pay_url", sa.String(500), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="new"),
        sa.Column("courier", sa.String(80), nullable=True),
        sa.Column("awb", sa.String(64), nullable=True, index=True),
        sa.Column("tracking_url", sa.String(500), nullable=True),
        sa.Column("courier_status", sa.String(60), nullable=True),
        sa.Column("shiprocket_order_id", sa.String(32), nullable=True),
        sa.Column("shiprocket_shipment_id", sa.String(32), nullable=True),
        sa.Column("shipped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invoice_number", sa.String(32), nullable=True),
        sa.Column("confirmation_sent", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("cod_confirmation", sa.String(16), nullable=True),
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("recovered", sa.Boolean(), nullable=False, server_default=sa.false()),
        *_timestamps(),
        sa.UniqueConstraint("tenant_id", "number", name="uq_shop_orders_tenant_number"),
    )
    op.create_index("ix_shop_orders_tenant_created", "shop_orders", ["tenant_id", "created_at"])

    op.create_table(
        "shop_carts",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("contact_id", UUID, sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", UUID, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", UUID, sa.ForeignKey("shop_products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("automation_id", UUID, sa.ForeignKey("comment_automations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("stage", sa.String(16), nullable=False, server_default="browsing"),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("order_id", UUID, sa.ForeignKey("shop_orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.UniqueConstraint("contact_id", "product_id", name="uq_shop_carts_contact_product"),
    )
    op.create_index("ix_shop_carts_stage_updated", "shop_carts", ["stage", "updated_at"])

    op.add_column("comment_automations", sa.Column("product_id", UUID, sa.ForeignKey("shop_products.id", ondelete="SET NULL"), nullable=True))
    op.add_column("comment_automations", sa.Column("buy_button", sa.String(20), nullable=False, server_default=""))
    op.add_column("comment_automations", sa.Column("orders", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("comment_automations", sa.Column("revenue", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    for col in ("revenue", "orders", "buy_button", "product_id"):
        op.drop_column("comment_automations", col)
    op.drop_index("ix_shop_carts_stage_updated", table_name="shop_carts")
    op.drop_table("shop_carts")
    op.drop_index("ix_shop_orders_tenant_created", table_name="shop_orders")
    op.drop_table("shop_orders")
    op.drop_table("shop_variants")
    op.drop_table("shop_products")
    op.drop_table("shops")
