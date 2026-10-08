"""Instagram Shop: store settings, products (incl. import from Instagram posts) and orders; plus the public store and checkout."""

from __future__ import annotations

import hmac
import uuid
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_manager, require_writer
from app.core import ratelimit
from app.models.billing import PaymentLink
from app.models.comment_automation import CommentAutomation
from app.models.instagram_account import InstagramAccount
from app.models.shop import Shop, ShopCart, ShopOrder, ShopProduct, ShopVariant
from app.services import payment_links, shiprocket
from app.services.billing import GSTIN_RE
from app.services.instagram.accounts import public_base
from app.services import shop as svc

router = APIRouter(prefix="/shop", tags=["shop"])
public = APIRouter(prefix="/public/store", tags=["public"])
# Shiprocket refuses webhook URLs containing "shiprocket" / "sr" / "kr", hence the neutral name.
courier = APIRouter(prefix="/courier-updates", tags=["public"])

URL = r"^https?://[^\s]+$"


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _err(exc: svc.ShopError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail={"error": exc.message})


# ---- schemas -------------------------------------------------------------------------------------------------------

class ShopIn(BaseModel):
    slug: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=1, max_length=100)
    tagline: str = Field(default="", max_length=300)
    account_id: uuid.UUID | None = None
    logo_url: str | None = Field(default=None, pattern=URL, max_length=2000)
    published: bool = True
    online_payments: bool = True
    cod_enabled: bool = False
    shipping_fee: int = Field(default=0, ge=0, le=10_000_00)
    free_shipping_above: int | None = Field(default=None, ge=0, le=10_000_000_00)
    support_phone: str = Field(default="", max_length=32)
    confirmation_message: str = Field(default="", max_length=900)
    chat_orders: bool = True
    cod_confirmation: bool = True
    reminders_enabled: bool = True
    reminder_after_minutes: int = Field(default=60, ge=10, le=1200)
    reminder_message: str = Field(default="", max_length=640)
    gstin: str = Field(default="", max_length=15)
    legal_name: str = Field(default="", max_length=200)
    business_address: str = Field(default="", max_length=500)
    gst_rate: Literal[0, 5, 12, 18, 28] = 0

    @field_validator("gstin")
    @classmethod
    def _gstin(cls, v: str) -> str:
        v = v.strip().upper()
        if v and not GSTIN_RE.match(v):
            raise ValueError("That GSTIN doesn't look right (15 characters, e.g. 27ABCDE1234F1Z5).")
        return v

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not svc.SLUG.match(v) or v in svc.RESERVED_SLUGS:
            raise ValueError("Use 3–40 lowercase letters, numbers and dashes.")
        return v

    @model_validator(mode="after")
    def _check(self):
        if not (self.online_payments or self.cod_enabled):
            raise ValueError("Turn on online payments, cash on delivery, or both.")
        return self


class OptionGroup(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    values: list[str] = Field(min_length=1, max_length=20)

    @field_validator("values")
    @classmethod
    def _values(cls, v: list[str]) -> list[str]:
        out: list[str] = []
        for x in v:
            x = x.strip()[:40]
            if x and x.casefold() not in {o.casefold() for o in out}:
                out.append(x)
        if not out:
            raise ValueError("Add at least one value.")
        return out


class VariantIn(BaseModel):
    options: dict[str, str]
    price: int | None = Field(default=None, ge=100, le=10_000_000_00)  # None = the product's price
    stock: int | None = Field(default=None, ge=0, le=1_000_000)
    enabled: bool = True


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    price: int = Field(ge=100, le=10_000_000_00)  # paise; Razorpay's minimum is ₹1
    compare_at_price: int | None = Field(default=None, ge=0, le=10_000_000_00)
    image_url: str | None = Field(default=None, pattern=URL, max_length=2000)
    status: Literal["active", "hidden"] = "active"
    stock: int | None = Field(default=None, ge=0, le=1_000_000)
    sort: int = 0
    # Size / colour etc. With options, every combination is a variant with its own stock (and optionally price).
    options: list[OptionGroup] = Field(default_factory=list, max_length=2)
    variants: list[VariantIn] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _check(self):
        names = [g.name.strip() for g in self.options]
        if len({n.casefold() for n in names}) != len(names):
            raise ValueError("Option names must be different (e.g. Size and Colour).")
        allowed = {g.name.strip(): set(g.values) for g in self.options}
        seen: set[tuple] = set()
        for v in self.variants:
            if set(v.options) != set(allowed):
                raise ValueError("Every variant needs a value for each option.")
            if any(v.options[n] not in allowed[n] for n in allowed):
                raise ValueError("A variant uses a value that isn't in its option's list.")
            combo = tuple(v.options[n].casefold() for n in names)
            if combo in seen:
                raise ValueError("Two variants have the same options.")
            seen.add(combo)
        if self.options and not self.variants:
            raise ValueError("Add at least one variant, or remove the options.")
        if self.variants and not self.options:
            raise ValueError("Variants need options (e.g. Size).")
        return self


class ImportIn(BaseModel):
    account_id: uuid.UUID
    media_ids: list[str] = Field(min_length=1, max_length=50)


class OrderPatch(BaseModel):
    status: Literal["new", "confirmed", "shipped", "delivered", "returned", "cancelled"] | None = None
    mark_paid: bool = False  # COD collected


class Address(BaseModel):
    line1: str = Field(min_length=3, max_length=200)
    line2: str = Field(default="", max_length=200)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    pincode: str = Field(pattern=r"^[1-9][0-9]{5}$")


class LineIn(BaseModel):
    product_id: uuid.UUID
    variant_id: uuid.UUID | None = None
    qty: int = Field(default=1, ge=1, le=svc.MAX_QTY)


class CheckoutIn(BaseModel):
    items: list[LineIn] = Field(default_factory=list, max_length=svc.MAX_LINES)
    # A single item (the product page's "Buy now"), kept for simple clients.
    product_id: uuid.UUID | None = None
    variant_id: uuid.UUID | None = None
    qty: int = Field(default=1, ge=1, le=svc.MAX_QTY)
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=8, max_length=20)
    email: EmailStr | None = None
    address: Address
    note: str = Field(default="", max_length=500)
    payment_method: Literal["online", "cod"] = "online"
    ref: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def _lines(self):
        if not self.items and self.product_id:
            self.items = [LineIn(product_id=self.product_id, variant_id=self.variant_id, qty=self.qty)]
        if not self.items:
            raise ValueError("Your cart is empty.")
        return self


# ---- serialisers ---------------------------------------------------------------------------------------------------

def shop_out(s: Shop) -> dict:
    return {"id": str(s.id), "slug": s.slug, "name": s.name, "tagline": s.tagline, "account_id": str(s.account_id) if s.account_id else None,
            "logo_url": s.logo_url, "published": s.published, "online_payments": s.online_payments, "cod_enabled": s.cod_enabled,
            "shipping_fee": s.shipping_fee, "free_shipping_above": s.free_shipping_above, "support_phone": s.support_phone,
            "confirmation_message": s.confirmation_message, "default_confirmation_message": svc.DEFAULT_CONFIRMATION, "chat_orders": s.chat_orders,
            "cod_confirmation": s.cod_confirmation, "reminders_enabled": s.reminders_enabled, "reminder_after_minutes": s.reminder_after_minutes,
            "reminder_message": s.reminder_message, "default_reminder_message": svc.DEFAULT_REMINDER, "gstin": s.gstin, "legal_name": s.legal_name,
            "business_address": s.business_address, "gst_rate": s.gst_rate, "url": svc.store_url(s), "views": s.views}


def variant_out(v: ShopVariant) -> dict:
    return {"id": str(v.id), "title": v.title, "options": v.options, "price": v.price, "stock": v.stock, "enabled": v.enabled}


def product_out(p: ShopProduct, variants: list[ShopVariant] | None = None) -> dict:
    return {"id": str(p.id), "name": p.name, "description": p.description, "price": p.price, "compare_at_price": p.compare_at_price, "image_url": p.image_url,
            "media_id": p.media_id, "permalink": p.permalink, "status": p.status, "stock": p.stock, "sort": p.sort, "options": p.options or [],
            "variants": [variant_out(v) for v in variants or []], "orders_count": p.orders_count, "revenue": p.revenue, "created_at": _iso(p.created_at)}


def _order_path(o: ShopOrder, slug: str | None) -> dict:
    if not slug:
        return {"order_url": None, "invoice_url": None}
    q = f"?t={o.access_token}"
    return {"order_url": f"/s/{slug}/order/{o.id}{q}", "invoice_url": f"/s/{slug}/invoice/{o.id}{q}" if o.invoice_number else None}


def order_out(o: ShopOrder, automation_name: str | None = None, slug: str | None = None) -> dict:
    return {"id": str(o.id), "number": o.number, "items": o.items or [], "subtotal": o.subtotal, "shipping": o.shipping, "total": o.total, "currency": o.currency,
            "customer_name": o.customer_name, "customer_phone": o.customer_phone, "customer_email": o.customer_email, "address": o.address or {}, "note": o.note,
            "contact_id": str(o.contact_id) if o.contact_id else None, "source": o.source,
            "automation": {"id": str(o.automation_id), "name": automation_name} if o.automation_id else None,
            "payment_method": o.payment_method, "payment_status": o.payment_status, "pay_url": o.pay_url, "paid_at": _iso(o.paid_at), "status": o.status,
            "confirmation_sent": o.confirmation_sent, "cod_confirmation": o.cod_confirmation, "recovered": o.recovered, "courier": o.courier, "awb": o.awb,
            "tracking_url": o.tracking_url, "courier_status": o.courier_status, "shiprocket_shipment_id": o.shiprocket_shipment_id, "shipped_at": _iso(o.shipped_at),
            "delivered_at": _iso(o.delivered_at), "invoice_number": o.invoice_number, **_order_path(o, slug), "created_at": _iso(o.created_at)}


def public_product(p: ShopProduct, variants: list[ShopVariant]) -> dict:
    live = [v for v in variants if v.enabled] if p.options else []
    prices = [svc.unit_price(p, v) for v in live]
    return {"id": str(p.id), "name": p.name, "description": p.description, "price": min(prices) if prices else p.price, "price_varies": len(set(prices)) > 1,
            "compare_at_price": p.compare_at_price, "image_url": p.image_url, "permalink": p.permalink, "sold_out": not svc.in_stock(p, variants),
            "options": (p.options or []) if live else [],
            "variants": [{"id": str(v.id), "title": v.title, "options": v.options, "price": svc.unit_price(p, v), "sold_out": v.stock is not None and v.stock <= 0}
                         for v in live]}


# ---- dashboard: store ------------------------------------------------------------------------------------------------

async def _shop(db: AsyncSession, tenant_id: uuid.UUID) -> Shop | None:
    return (await db.execute(select(Shop).where(Shop.tenant_id == tenant_id))).scalar_one_or_none()


async def _require_shop(db: AsyncSession, ctx: Ctx) -> Shop:
    s = await _shop(db, ctx.tenant_id)
    if s is None:
        raise HTTPException(status_code=409, detail={"error": "Set up your store first."})
    return s


@router.get("")
async def get_shop(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    s = await _shop(db, ctx.tenant_id)
    payments = await payment_links.status(db, ctx.tenant_id)
    paid = [ShopOrder.tenant_id == ctx.tenant_id, ShopOrder.payment_status.in_(("paid", "cod")), ShopOrder.status != "cancelled"]
    totals = (await db.execute(select(func.count(), func.coalesce(func.sum(ShopOrder.total), 0)).where(*paid))).one()
    from_comments = (await db.execute(select(func.count(), func.coalesce(func.sum(ShopOrder.total), 0)).where(*paid, ShopOrder.source.in_(("comment", "chat"))))).one()
    recovered = (await db.execute(select(func.count(), func.coalesce(func.sum(ShopOrder.total), 0)).where(*paid, ShopOrder.recovered.is_(True)))).one()
    pending = (await db.execute(select(func.count()).select_from(ShopOrder).where(ShopOrder.tenant_id == ctx.tenant_id, ShopOrder.payment_status == "pending"))).scalar_one()
    to_ship = (await db.execute(select(func.count()).select_from(ShopOrder).where(*paid, ShopOrder.status.in_(("new", "confirmed"))))).scalar_one()
    return {"shop": shop_out(s) if s else None, "payments": {"connected": payments["connected"], "test_mode": payments["test_mode"]},
            "stats": {"orders": totals[0], "revenue": int(totals[1]), "comment_orders": from_comments[0], "comment_revenue": int(from_comments[1]),
                      "recovered_orders": recovered[0], "recovered_revenue": int(recovered[1]), "awaiting_payment": pending, "to_ship": to_ship,
                      "views": s.views if s else 0}}


@router.put("")
async def save_shop(body: ShopIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    s = await _shop(db, ctx.tenant_id)
    taken = (await db.execute(select(Shop.id).where(Shop.slug == body.slug, Shop.tenant_id != ctx.tenant_id))).first()
    if taken:
        raise HTTPException(status_code=409, detail={"error": f"“{body.slug}” is taken — try another address."})
    if body.account_id:
        account = await db.get(InstagramAccount, body.account_id)
        if account is None or account.tenant_id != ctx.tenant_id:
            raise HTTPException(status_code=422, detail={"error": "Choose one of your connected Instagram accounts."})
    if s is None:
        s = Shop(tenant_id=ctx.tenant_id, slug=body.slug, name=body.name)
        db.add(s)
    for k, v in body.model_dump().items():
        setattr(s, k, v.strip() if isinstance(v, str) else v)
    await db.commit()
    await db.refresh(s)
    return shop_out(s)


# ---- dashboard: products ---------------------------------------------------------------------------------------------

async def _product(db: AsyncSession, ctx: Ctx, product_id: uuid.UUID) -> ShopProduct:
    p = await db.get(ShopProduct, product_id)
    if p is None or p.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Product not found."})
    return p


@router.get("/products")
async def list_products(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(ShopProduct).where(ShopProduct.tenant_id == ctx.tenant_id).order_by(ShopProduct.sort, ShopProduct.created_at.desc()))).scalars().all()
    variants = await svc.variants_of(db, [p.id for p in rows])
    return [product_out(p, variants[p.id]) for p in rows]


async def _save_product(db: AsyncSession, p: ShopProduct, body: ProductIn) -> dict:
    data = body.model_dump(exclude={"options", "variants"})
    for k, v in data.items():
        setattr(p, k, v)
    await db.flush()
    await svc.set_variants(db, p, [{"name": g.name.strip(), "values": g.values} for g in body.options],
                           [{**v.model_dump(), "options": {k.strip(): val for k, val in v.options.items()}} for v in body.variants])
    await db.commit()
    await db.refresh(p)
    return product_out(p, (await svc.variants_of(db, [p.id]))[p.id])


@router.post("/products", status_code=status.HTTP_201_CREATED)
async def create_product(body: ProductIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    p = ShopProduct(tenant_id=ctx.tenant_id, name=body.name, price=body.price)
    db.add(p)
    return await _save_product(db, p, body)


@router.put("/products/{product_id}")
async def update_product(product_id: uuid.UUID, body: ProductIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    return await _save_product(db, await _product(db, ctx, product_id), body)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_product(product_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    await db.delete(await _product(db, ctx, product_id))
    await db.commit()


@router.post("/products/import")
async def import_products(body: ImportIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    """Create products from Instagram posts: name, description and price are read from the caption, and the photo is copied."""
    account = await db.get(InstagramAccount, body.account_id)
    if account is None or account.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=422, detail={"error": "Choose one of your connected Instagram accounts."})
    result = await svc.import_posts(db, ctx.tenant_id, ctx.user_id, account, body.media_ids)
    return {"created": [product_out(p) for p in result["created"]], "skipped": result["skipped"], "errors": result["errors"]}


# ---- dashboard: orders -----------------------------------------------------------------------------------------------

@router.get("/orders")
async def list_orders(status_: str | None = Query(None, alias="status", max_length=16), payment: str | None = Query(None, max_length=16),
                      limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                      ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    cond = [ShopOrder.tenant_id == ctx.tenant_id]
    if status_:
        cond.append(ShopOrder.status == status_)
    if payment:
        cond.append(ShopOrder.payment_status == payment)
    total = (await db.execute(select(func.count()).select_from(ShopOrder).where(*cond))).scalar_one()
    rows = (await db.execute(select(ShopOrder, CommentAutomation.name).outerjoin(CommentAutomation, CommentAutomation.id == ShopOrder.automation_id)
                             .where(*cond).order_by(ShopOrder.created_at.desc()).limit(limit).offset(offset))).all()
    s = await _shop(db, ctx.tenant_id)
    return {"total": total, "items": [order_out(o, name, s.slug if s else None) for o, name in rows]}


@router.patch("/orders/{order_id}")
async def update_order(order_id: uuid.UUID, body: OrderPatch, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    o = await db.get(ShopOrder, order_id)
    if o is None or o.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Order not found."})
    if body.mark_paid:
        if o.payment_method != "cod":
            raise HTTPException(status_code=409, detail={"error": "Online orders are marked paid automatically when Razorpay confirms the payment."})
        o.payment_status, o.paid_at = "paid", o.paid_at or svc.utcnow()
    if body.status == "cancelled":
        await svc.cancel(db, o)  # gives the stock back
    elif body.status in ("shipped", "delivered"):
        try:
            if body.status == "shipped":
                await svc.mark_shipped(db, o, courier=None, awb=None, tracking=None)
            else:
                await svc.mark_delivered(db, o)
        except svc.ShopError as exc:
            raise _err(exc)
    elif body.status:
        if o.status == "cancelled":
            raise HTTPException(status_code=409, detail={"error": "This order was cancelled — its stock has been released. Ask the customer to order again."})
        if o.payment_status == "pending" and body.status in ("shipped", "delivered"):
            raise HTTPException(status_code=409, detail={"error": "This order hasn't been paid yet."})
        o.status = body.status
        if o.cod_confirmation == "asked" and body.status != "new":
            o.cod_confirmation = "confirmed"  # the seller confirmed it themselves (e.g. on a call)
    await db.commit()
    await db.refresh(o)
    s = await _shop(db, ctx.tenant_id)
    return order_out(o, slug=s.slug if s else None)


# ---- public store --------------------------------------------------------------------------------------------------------

async def _public_shop(db: AsyncSession, slug: str) -> Shop:
    s = (await db.execute(select(Shop).where(Shop.slug == slug.lower()[:40], Shop.published.is_(True)))).scalar_one_or_none()
    if s is None:
        raise HTTPException(status_code=404, detail={"error": "Store not found."})
    return s


async def _store_info(db: AsyncSession, s: Shop) -> dict:
    account = await db.get(InstagramAccount, s.account_id) if s.account_id else None
    return {"slug": s.slug, "name": s.name, "tagline": s.tagline, "logo_url": s.logo_url or (account.profile_picture_url if account else None),
            "instagram": account.username if account else None, "support_phone": s.support_phone, "shipping_fee": s.shipping_fee,
            "free_shipping_above": s.free_shipping_above, "payment_methods": await svc.payment_methods(db, s)}


@public.get("/{slug}")
async def view_store(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    s = await _public_shop(db, slug)
    if ratelimit.allow(f"store-view:{s.id}:{ratelimit.client_ip(request)}", 1, 1800):
        await db.execute(update(Shop).where(Shop.id == s.id).values(views=Shop.views + 1))
        await db.commit()
    products = (await db.execute(select(ShopProduct).where(ShopProduct.tenant_id == s.tenant_id, ShopProduct.status == "active", ShopProduct.price >= 100)
                                 .order_by(ShopProduct.sort, ShopProduct.created_at.desc()))).scalars().all()
    variants = await svc.variants_of(db, [p.id for p in products])
    return {"store": await _store_info(db, s), "products": [public_product(p, variants[p.id]) for p in products]}


@public.get("/{slug}/products/{product_id}")
async def view_product(slug: str, product_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict:
    s = await _public_shop(db, slug)
    p = await db.get(ShopProduct, product_id)
    if p is None or p.tenant_id != s.tenant_id or p.status != "active":
        raise HTTPException(status_code=404, detail={"error": "Product not found."})
    return {"store": await _store_info(db, s), "product": public_product(p, (await svc.variants_of(db, [p.id]))[p.id])}


@public.post("/{slug}/checkout", status_code=status.HTTP_201_CREATED)
async def checkout(slug: str, body: CheckoutIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    ratelimit.limit(request, "store-checkout", 10, 600)
    s = await _public_shop(db, slug)
    try:
        o = await svc.checkout(db, s, lines=[i.model_dump() for i in body.items], name=body.name.strip(), phone=body.phone, email=body.email,
                               address=body.address.model_dump(), note=body.note.strip(), payment_method=body.payment_method, ref=body.ref)
    except svc.ShopError as exc:
        raise _err(exc)
    return {"order_id": str(o.id), "token": o.access_token, "number": o.number, "pay_url": o.pay_url, "order_url": svc.order_url(s, o)}


@public.get("/{slug}/orders/{order_id}")
async def view_order(slug: str, order_id: uuid.UUID, request: Request, t: str = Query(min_length=8, max_length=64), db: AsyncSession = Depends(get_db)) -> dict:
    s = await _public_shop(db, slug)
    o = await db.get(ShopOrder, order_id)
    if o is None or o.tenant_id != s.tenant_id or not hmac.compare_digest(o.access_token, t):
        raise HTTPException(status_code=404, detail={"error": "Order not found."})
    # Coming back from Razorpay usually beats the webhook: ask Razorpay directly (throttled), so the page shows "paid" straight away.
    if o.payment_status == "pending" and o.payment_link_id and ratelimit.allow(f"order-refresh:{o.id}", 1, 5):
        link = await db.get(PaymentLink, o.payment_link_id)
        if link is not None and link.status == "created":
            try:
                await payment_links.refresh(db, link)
            except payment_links.LinkError:
                pass
            await db.refresh(o)
    return {"store": await _store_info(db, s), "order": {
        "number": o.number, "items": o.items or [], "subtotal": o.subtotal, "shipping": o.shipping, "total": o.total, "customer_name": o.customer_name,
        "address": o.address or {}, "payment_method": o.payment_method, "payment_status": o.payment_status, "status": o.status,
        "pay_url": o.pay_url if o.payment_status == "pending" else None, "courier": o.courier, "awb": o.awb, "tracking_url": o.tracking_url,
        "courier_status": o.courier_status, "shipped_at": _iso(o.shipped_at), "delivered_at": _iso(o.delivered_at), "has_invoice": bool(o.invoice_number),
        "created_at": _iso(o.created_at)}}


# ---- shipping ------------------------------------------------------------------------------------------------------------

class ShipIn(BaseModel):
    courier: str = Field(default="", max_length=80)
    awb: str = Field(default="", max_length=64)
    tracking_url: str | None = Field(default=None, pattern=URL, max_length=500)


class Package(BaseModel):
    weight_kg: float = Field(gt=0, le=100)
    length_cm: float = Field(gt=0, le=300)
    breadth_cm: float = Field(gt=0, le=300)
    height_cm: float = Field(gt=0, le=300)


class ShiprocketShipIn(BaseModel):
    city: str | None = Field(default=None, max_length=80)
    state: str | None = Field(default=None, max_length=80)
    package: Package | None = None


class ShiprocketIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(default="", max_length=200)  # empty on a settings update keeps the saved one
    pickup_location: str | None = Field(default=None, max_length=120)
    package: Package | None = None


async def _owned_order(db: AsyncSession, ctx: Ctx, order_id: uuid.UUID) -> ShopOrder:
    o = await db.get(ShopOrder, order_id)
    if o is None or o.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Order not found."})
    return o


@router.post("/orders/{order_id}/ship")
async def ship_order(order_id: uuid.UUID, body: ShipIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    """Mark shipped with the courier and AWB you got yourself (any courier)."""
    o = await _owned_order(db, ctx, order_id)
    try:
        await svc.mark_shipped(db, o, courier=body.courier.strip() or None, awb=body.awb.strip() or None, tracking=body.tracking_url)
    except svc.ShopError as exc:
        raise _err(exc)
    await db.refresh(o)
    return order_out(o)


@router.post("/orders/{order_id}/shiprocket")
async def ship_with_shiprocket(order_id: uuid.UUID, body: ShiprocketShipIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    o = await _owned_order(db, ctx, order_id)
    try:
        shipped = await svc.ship_with_shiprocket(db, o, city=body.city, state=body.state, package=body.package.model_dump() if body.package else None)
    except svc.ShopError as exc:
        raise _err(exc)
    await db.refresh(o)
    return {"order": order_out(o), "shipped": shipped,
            "message": None if shipped else "The order is in Shiprocket, but no courier was assigned yet (check your Shiprocket wallet / serviceability). Try again, or assign one in Shiprocket."}


@router.get("/shiprocket")
async def shiprocket_status(request: Request, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    return await shiprocket.status(db, ctx.tenant_id, public_base(str(request.base_url)))


@router.put("/shiprocket")
async def connect_shiprocket(body: ShiprocketIn, request: Request, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await shiprocket.connect(db, ctx.tenant_id, email=body.email, password=body.password, pickup_location=body.pickup_location,
                                        package=body.package.model_dump() if body.package else None, base=public_base(str(request.base_url)))
    except shiprocket.ShiprocketError as exc:
        raise HTTPException(status_code=exc.status if exc.status in (409, 422) else 502, detail={"error": exc.message})


@router.delete("/shiprocket", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def disconnect_shiprocket(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    await shiprocket.disconnect(db, ctx.tenant_id)


@courier.post("/{token}")
async def courier_webhook(token: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Shiprocket's tracking webhook (Shiprocket → Settings → API → Webhooks), authenticated by the x-api-key we gave the seller."""
    ratelimit.limit(request, "courier-hook", 240, 60, token[:8])
    row = await shiprocket.hook_row(db, token)
    if row is None:
        raise HTTPException(status_code=404, detail={"error": "Unknown hook."})
    if not shiprocket.verify(row, request.headers.get("x-api-key")):
        raise HTTPException(status_code=401, detail={"error": "Bad x-api-key."})
    try:
        payload = await request.json()
    except ValueError:
        payload = {}
    result = await svc.courier_update(db, row.tenant_id, payload if isinstance(payload, dict) else {})
    row.last_event_at = svc.utcnow()
    await db.commit()
    return {"ok": True, "result": result}


# ---- reports ---------------------------------------------------------------------------------------------------------------

@router.get("/reports")
async def reports(days: int = Query(30, ge=7, le=365), ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    """Where the money comes from: sales per day, per channel, per comment automation (i.e. per post / reel) and per product."""
    since = svc.utcnow() - timedelta(days=days)
    counted = [ShopOrder.tenant_id == ctx.tenant_id, ShopOrder.payment_status.in_(("paid", "cod")), ShopOrder.status.not_in(("cancelled", "returned"))]
    day = func.date_trunc("day", func.timezone("Asia/Kolkata", ShopOrder.created_at))
    series = (await db.execute(select(day, func.count(), func.coalesce(func.sum(ShopOrder.total), 0)).where(*counted, ShopOrder.created_at >= since)
                               .group_by(day).order_by(day))).all()
    by_source = (await db.execute(select(ShopOrder.source, func.count(), func.coalesce(func.sum(ShopOrder.total), 0)).where(*counted, ShopOrder.created_at >= since)
                                  .group_by(ShopOrder.source))).all()
    taps = dict((await db.execute(select(ShopCart.automation_id, func.count()).where(ShopCart.tenant_id == ctx.tenant_id, ShopCart.automation_id.is_not(None))
                                  .group_by(ShopCart.automation_id))).all())
    autos = (await db.execute(select(CommentAutomation).where(CommentAutomation.tenant_id == ctx.tenant_id,
                                                              (CommentAutomation.product_id.is_not(None)) | (CommentAutomation.orders > 0))
                              .order_by(CommentAutomation.revenue.desc()))).scalars().all()
    products = (await db.execute(select(ShopProduct).where(ShopProduct.tenant_id == ctx.tenant_id, ShopProduct.orders_count > 0)
                                 .order_by(ShopProduct.revenue.desc()).limit(10))).scalars().all()
    returned = (await db.execute(select(func.count()).select_from(ShopOrder).where(ShopOrder.tenant_id == ctx.tenant_id, ShopOrder.status == "returned",
                                                                                   ShopOrder.created_at >= since))).scalar_one()
    rows = [{"id": str(a.id), "name": a.name, "thumbnail_url": next((m.get("thumbnail_url") for m in a.media_preview or [] if m.get("thumbnail_url")), None),
             "posts": "All posts" if a.media_scope == "all" else f"{len(a.media_ids or [])} post(s)" if a.media_scope == "specific" else a.media_scope,
             "comments": a.comments_matched, "dms": a.dms_sent, "buy_taps": int(taps.get(a.id, 0)), "orders": a.orders, "revenue": a.revenue,
             "conversion": round(100 * a.orders / a.comments_matched, 1) if a.comments_matched else 0.0} for a in autos]
    return {
        "days": days,
        "series": [{"date": d.date().isoformat(), "orders": n, "revenue": int(v)} for d, n, v in series],
        "by_source": {s: {"orders": n, "revenue": int(v)} for s, n, v in by_source},
        "funnel": {"comments": sum(r["comments"] for r in rows), "dms": sum(r["dms"] for r in rows), "buy_taps": sum(r["buy_taps"] for r in rows),
                   "orders": sum(r["orders"] for r in rows), "revenue": sum(r["revenue"] for r in rows)},
        "by_automation": rows,
        "by_product": [{"id": str(p.id), "name": p.name, "image_url": p.image_url, "orders": p.orders_count, "revenue": p.revenue} for p in products],
        "returned": returned,
    }


# ---- public invoice ---------------------------------------------------------------------------------------------------------

@public.get("/{slug}/orders/{order_id}/invoice")
async def view_invoice(slug: str, order_id: uuid.UUID, t: str = Query(min_length=8, max_length=64), db: AsyncSession = Depends(get_db)) -> dict:
    s = await _public_shop(db, slug)
    o = await db.get(ShopOrder, order_id)
    if o is None or o.tenant_id != s.tenant_id or not hmac.compare_digest(o.access_token, t):
        raise HTTPException(status_code=404, detail={"error": "Invoice not found."})
    if o.payment_status == "pending" or o.status == "cancelled":
        raise HTTPException(status_code=409, detail={"error": "An invoice is issued once the order is confirmed."})
    return svc.invoice(s, o)
