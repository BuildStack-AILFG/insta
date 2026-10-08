"""
Instagram Shop: a storefront for businesses that sell on Instagram without a website.

One Shop per workspace (public at {frontend}/s/{slug}), a product catalogue (often imported straight from the account's posts), and the
orders customers place from the store page or from a comment-automation DM. Online payments go through the workspace's *own* Razorpay
account (services/payment_links.py), so the money never passes through us. Amounts are integers in paise, like the rest of billing.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Shop(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "shops"

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True)
    # The Instagram account whose DMs carry order updates (and whose profile picture the store shows).
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("instagram_accounts.id", ondelete="SET NULL"), nullable=True)
    slug: Mapped[str] = mapped_column(String(40), nullable=False, unique=True)
    # The seller's own domain (e.g. shop.priyaboutique.com): pending until its DNS points at us, then active.
    custom_domain: Mapped[str | None] = mapped_column(String(253), nullable=True, unique=True)
    domain_status: Mapped[str] = mapped_column(String(16), default="none")  # none|pending|active
    domain_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    tagline: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    published: Mapped[bool] = mapped_column(Boolean, default=True)

    online_payments: Mapped[bool] = mapped_column(Boolean, default=True)  # needs the workspace's Razorpay keys connected
    cod_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    shipping_fee: Mapped[int] = mapped_column(Integer, default=0)
    free_shipping_above: Mapped[int | None] = mapped_column(Integer, nullable=True)  # order subtotal at/above which shipping is free
    support_phone: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    # DM sent once an order is paid (or placed as COD). Placeholders: {{name}} {{order}} {{total}} {{link}}
    confirmation_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # Ordering inside the DM: the buyer sends their address in chat instead of opening the checkout page.
    chat_orders: Mapped[bool] = mapped_column(Boolean, default=True)
    # COD orders from Instagram buyers get a "Confirm / Cancel" DM first, so fewer parcels come back unclaimed (RTO).
    cod_confirmation: Mapped[bool] = mapped_column(Boolean, default=True)
    # One nudge for people who tapped Buy but didn't order, and for online orders left unpaid (only inside Instagram's 24h window).
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    reminder_after_minutes: Mapped[int] = mapped_column(Integer, default=60)
    reminder_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # GST invoices. Prices are GST-inclusive; with no GSTIN (or a 0% rate) the invoice is a plain bill without tax lines.
    gstin: Mapped[str] = mapped_column(String(15), nullable=False, default="")
    legal_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    business_address: Mapped[str] = mapped_column(Text, nullable=False, default="")
    gst_rate: Mapped[int] = mapped_column(Integer, default=0)  # percent: 0|5|12|18|28
    invoice_seq: Mapped[int] = mapped_column(Integer, default=0)
    # The storefront website: brand colour, announcement bar, hero carousel, about, FAQ and which sections show.
    # Missing keys fall back to services/shop.py DEFAULT_SITE, so older stores render the same template.
    site: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    order_seq: Mapped[int] = mapped_column(Integer, default=1000)  # last order number handed out
    views: Mapped[int] = mapped_column(Integer, default=0)


class ShopProduct(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "shop_products"
    __table_args__ = (UniqueConstraint("tenant_id", "media_id", name="uq_shop_products_tenant_media"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    price: Mapped[int] = mapped_column(Integer, nullable=False)
    compare_at_price: Mapped[int | None] = mapped_column(Integer, nullable=True)  # struck-through "MRP"
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    images: Mapped[list] = mapped_column(JSON, nullable=False, default=list)  # more photos for the product page carousel
    # The Instagram post it was imported from (also lets a comment on that post find the product).
    media_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    permalink: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active|hidden
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None = not tracked; products with variants track stock per variant
    # Up to two option groups, e.g. [{"name": "Size", "values": ["S", "M", "L"]}, {"name": "Colour", "values": ["Red", "Black"]}]
    options: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    sort: Mapped[int] = mapped_column(Integer, default=0)

    orders_count: Mapped[int] = mapped_column(Integer, default=0)  # paid / COD orders
    revenue: Mapped[int] = mapped_column(Integer, default=0)


class ShopVariant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One combination of a product's options ("M / Red"), with its own stock and optionally its own price."""

    __tablename__ = "shop_variants"
    __table_args__ = (UniqueConstraint("product_id", "key", name="uq_shop_variants_product_key"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shop_products.id", ondelete="CASCADE"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String(200), nullable=False)  # normalised options ("colour=red|size=m"), to keep stock across edits
    title: Mapped[str] = mapped_column(String(120), nullable=False)  # "M / Red"
    options: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # {"Size": "M", "Colour": "Red"}
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None = the product's price
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)  # None = not tracked
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)


class ShopOrder(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "shop_orders"
    __table_args__ = (
        UniqueConstraint("tenant_id", "number", name="uq_shop_orders_tenant_number"),
        Index("ix_shop_orders_tenant_created", "tenant_id", "created_at"),
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Secret in the customer's order-status link, so order pages can't be enumerated.
    access_token: Mapped[str] = mapped_column(String(48), nullable=False)

    # [{product_id, variant_id, name, variant, price, qty, image_url}] — a snapshot, so later product edits don't rewrite history.
    items: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    subtotal: Mapped[int] = mapped_column(Integer, nullable=False)
    shipping: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="INR")

    customer_name: Mapped[str] = mapped_column(String(120), nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(32), nullable=False)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # {line1, line2, city, state, pincode}
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")

    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True, index=True)
    # Where the sale came from: the store page, or a comment automation's DM (attributed through the signed ref in the link).
    source: Mapped[str] = mapped_column(String(16), default="store")  # store|comment|chat
    automation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("comment_automations.id", ondelete="SET NULL"), nullable=True, index=True)

    payment_method: Mapped[str] = mapped_column(String(8), nullable=False)  # online|cod
    payment_status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|paid|cod|failed
    payment_link_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("payment_links.id", ondelete="SET NULL"), nullable=True, index=True)
    pay_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="new")  # new|confirmed|shipped|delivered|returned|cancelled
    # Shipping: typed in by the seller, or filled by Shiprocket (and kept current by its tracking webhook).
    courier: Mapped[str | None] = mapped_column(String(80), nullable=True)
    awb: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    tracking_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    courier_status: Mapped[str | None] = mapped_column(String(60), nullable=True)  # the courier's own wording, e.g. "OUT FOR DELIVERY"
    shiprocket_order_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    shiprocket_shipment_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    invoice_number: Mapped[str | None] = mapped_column(String(32), nullable=True)  # given when the order is confirmed
    confirmation_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    cod_confirmation: Mapped[str | None] = mapped_column(String(16), nullable=True)  # asked|confirmed|declined
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)  # unpaid-order nudge
    recovered: Mapped[bool] = mapped_column(Boolean, default=False)  # placed / paid after a reminder


class ShopCart(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Someone who tapped "Buy now" in a DM: drives ordering in chat, and the reminder if they never order."""

    __tablename__ = "shop_carts"
    __table_args__ = (UniqueConstraint("contact_id", "product_id", name="uq_shop_carts_contact_product"),
                      Index("ix_shop_carts_stage_updated", "stage", "updated_at"))

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("shop_products.id", ondelete="CASCADE"), nullable=False)
    automation_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("comment_automations.id", ondelete="SET NULL"), nullable=True)
    # browsing (saw the product card) -> address (we asked for delivery details) -> review (summary shown) -> ordered
    stage: Mapped[str] = mapped_column(String(16), default="browsing")
    details: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)  # {name, phone, address} gathered in chat
    attempts: Mapped[int] = mapped_column(Integer, default=0)  # address messages we couldn't read
    order_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("shop_orders.id", ondelete="SET NULL"), nullable=True)
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
