"""
Instagram Shop: a storefront + checkout for businesses that sell on Instagram and have no website.

The flow that sets it apart from a plain store builder is comment-to-checkout:
  1. someone comments "price" on a post whose comment automation is linked to a product,
  2. the private-reply DM carries a "Buy now" postback button,
  3. tapping it is a message from them, which opens Instagram's 24h window, so we can DM the product card + a checkout link
     (signed with who they are, so the order is attributed to the comment automation and the contact),
  4. they pay on the store's checkout page with the workspace's own Razorpay account (or choose COD),
  5. once paid, the order is confirmed and they get a confirmation DM, and the automation's revenue counter moves.

Instead of the checkout page they can also order in the chat (send name / mobile / address, pick UPI or COD); COD orders from the
store page are confirmed over DM first; and anyone who tapped Buy but didn't order (or left an online order unpaid) gets one reminder.

Payment links and the Razorpay plumbing live in services/payment_links.py; this module only adds orders on top of them.
"""

from __future__ import annotations

import hashlib
import hmac
import io
import logging
import re
import secrets
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import func, literal_column, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.db import session as db_session
from app.models.billing import PaymentLink
from app.models.comment_automation import CommentAutomation
from app.models.contact import Contact
from app.models.conversation import Conversation, Message
from app.models.instagram_account import InstagramAccount
from app.models.shop import Shop, ShopCart, ShopOrder, ShopProduct, ShopVariant
from app.models.tenant import Tenant
from app.services import media_library, outbound_webhooks, payment_links
from app.services.instagram import messaging
from app.services.instagram.accounts import client_for
from app.services.instagram.graph import GraphError
from app.services.phone import InvalidPhone, normalize_phone

log = logging.getLogger(__name__)

BUY_PREFIX = "BUY:"      # BUY:<automation id> — the Buy button in a comment automation's DM
SHOP_PREFIX = "SHOP:"    # SHOP:<chat|var|qty|same|new|pay|cod>:<cart id>[:<variant id | qty>] — ordering in chat
COD_PREFIX = "COD:"      # COD:<yes|no>:<order id> — confirming a cash-on-delivery order
SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$")
RESERVED_SLUGS = {"admin", "api", "app", "dashboard", "login", "signup", "help", "support", "gramforgrow", "shop", "store"}
MAX_QTY = 10
DEFAULT_CONFIRMATION = "Thank you {{name}}! 🎉 Your order #{{order}} for {{total}} is confirmed. Message us “track” anytime to see where it is."
DEFAULT_BUY_BUTTON = "🛒 Buy now"
DEFAULT_COUNTRY_CODE = "91"  # stores are India-first; a workspace's own default wins

# A price in a caption: "₹499", "Rs. 1,299", "INR 899", "price: 450", "450/-"
_PRICE = re.compile(
    r"(?:₹|\brs\.?|\binr\b|\bprice\s*[:\-–]?\s*(?:₹|rs\.?|inr)?)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|([0-9][0-9,]*)\s*/-",
    re.IGNORECASE,
)
_HASHTAG = re.compile(r"(?:^|\s)[#@][\w.]+")

# Tests route image downloads to httpx.MockTransport.
_http_factory: Callable[[], httpx.AsyncClient] | None = None


class ShopError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message, self.status = message, status


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def inr(paise: int) -> str:
    """₹1,23,456 (Indian digit grouping), with paise only when there are any."""
    rupees, p = divmod(int(paise), 100)
    s = str(rupees)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = ",".join([head[max(0, i - 2):i] for i in range(len(head), 0, -2)][::-1])
        s = f"{head},{tail}"
    return f"₹{s}.{p:02d}" if p else f"₹{s}"


# ---- URLs & attribution ------------------------------------------------------------------------------------------

def _frontend() -> str:
    return get_settings().frontend_url.rstrip("/")


def store_url(shop: Shop) -> str:
    """The store's home. On a connected custom domain every store link (DMs, checkout, Razorpay's return) uses that domain."""
    if shop.custom_domain and shop.domain_status == "active":
        return f"https://{shop.custom_domain}"
    return f"{_frontend()}/s/{shop.slug}"


def product_url(shop: Shop, product: ShopProduct, ref: str | None = None) -> str:
    return f"{store_url(shop)}/p/{product.id}" + (f"?r={ref}" if ref else "")


def order_url(shop: Shop, order: ShopOrder) -> str:
    return f"{store_url(shop)}/order/{order.id}?t={order.access_token}"


# ---- storefront website ------------------------------------------------------------------------------------------
# Every store renders the same white template; `Shop.site` only holds what the seller changed. Anything left empty is
# filled from the store's own settings, so a brand-new store already looks complete.

DEFAULT_ACCENT = "#e11d48"
SITE_SECTIONS = ("best_sellers", "new_arrivals", "all_products", "instagram", "about", "faq")
# Page colours (the accent above colours buttons and badges); the template derives muted text and lines from these.
DEFAULT_COLORS = {"background": "#ffffff", "text": "#171717", "surface": "#f6f6f4", "button_text": "#ffffff"}
# Every heading and button label on the website, so a store can speak in its own words (or language).
DEFAULT_TEXTS = {
    "hero_button": "Shop now", "best_sellers_title": "Best sellers", "best_sellers_subtitle": "What everyone's ordering",
    "new_arrivals_title": "New arrivals", "new_arrivals_subtitle": "Just landed in the store", "all_products_title": "Shop all",
    "instagram_title": "Shop our Instagram", "instagram_subtitle": "Seen it on our feed? Tap to buy.", "faq_title": "Questions? Answers.",
    "related_title": "You may also like", "add_to_cart": "Add to cart", "buy_now": "Buy now", "empty_store": "New products are coming soon.",
}
DEFAULT_SITE: dict = {
    "accent": DEFAULT_ACCENT,
    "colors": DEFAULT_COLORS,
    "texts": DEFAULT_TEXTS,
    "announcement": "",
    "hero": [],  # [{image_url, title, subtitle, cta_label, product_id}]
    "about": {"title": "", "text": "", "image_url": None},
    "faq": [],  # [{q, a}]
    "sections": {k: True for k in SITE_SECTIONS},
    "policies": {"shipping": "", "returns": ""},
}


def site_settings(shop: Shop) -> dict:
    """What the seller saved, on top of the defaults (what the dashboard edits)."""
    saved = shop.site or {}
    merged = {**DEFAULT_SITE, **saved}
    for key in ("about", "sections", "policies", "colors"):
        merged[key] = {**DEFAULT_SITE[key], **(saved.get(key) or {})}
    merged["texts"] = {**DEFAULT_TEXTS, **{k: v for k, v in (saved.get("texts") or {}).items() if v}}  # an emptied field falls back to the default
    return merged


def public_site(shop: Shop, methods: list[str], products: list[ShopProduct] | None = None) -> dict:
    """The site as the storefront renders it: saved settings plus sensible content generated from the store's settings."""
    s = site_settings(shop)
    perks = []
    if shop.free_shipping_above is not None and shop.shipping_fee:
        perks.append(f"Free delivery on orders above {inr(shop.free_shipping_above)}")
    elif not shop.shipping_fee:
        perks.append("Free delivery on every order")
    if "cod" in methods:
        perks.append("Cash on delivery available")
    faq = s["faq"] or [x for x in (
        {"q": "Do you offer cash on delivery?", "a": "Yes — choose “Cash on delivery” at checkout and pay when your order arrives." if "cod" in methods
         else "We take online payments only (UPI, cards and netbanking), secured by Razorpay."},
        {"q": "How do I pay online?", "a": "Pay by UPI, card or netbanking on the secure Razorpay page — the money goes straight to us."} if "online" in methods else None,
        {"q": "How much is delivery?", "a": "Delivery is free." if not shop.shipping_fee else f"Delivery is {inr(shop.shipping_fee)}"
         + (f", and free on orders above {inr(shop.free_shipping_above)}." if shop.free_shipping_above is not None else ".")},
        {"q": "How do I track my order?", "a": "Use the link in your order confirmation" + (f", or DM us “track” on Instagram anytime." if shop.account_id else ".")},
    ) if x]
    hero = s["hero"]
    if not hero and products:
        hero = [{"image_url": p.image_url, "title": p.name, "subtitle": shop.tagline or "", "cta_label": s["texts"]["hero_button"], "product_id": str(p.id)}
                for p in products if p.image_url][:3]
    return {**s, "announcement": s["announcement"] or " · ".join(perks), "faq": faq, "hero": hero}


def _sig(body: str) -> str:
    return hmac.new(get_settings().jwt_secret.encode(), f"shop-ref:{body}".encode(), hashlib.sha256).hexdigest()[:20]


def make_ref(contact_id: uuid.UUID, automation_id: uuid.UUID | None) -> str:
    """Opaque token in a DM checkout link: who tapped "Buy now", and which automation sent them. Signed, so it can't be forged."""
    body = f"{contact_id.hex}.{automation_id.hex if automation_id else ''}"
    return f"{body}.{_sig(body)}"


def read_ref(ref: str | None) -> tuple[uuid.UUID, uuid.UUID | None] | None:
    try:
        contact_hex, automation_hex, sig = (ref or "").split(".")
        if not hmac.compare_digest(sig, _sig(f"{contact_hex}.{automation_hex}")):
            return None
        return uuid.UUID(contact_hex), (uuid.UUID(automation_hex) if automation_hex else None)
    except ValueError:
        return None


# ---- catalogue -----------------------------------------------------------------------------------------------------

def parse_caption(caption: str | None) -> tuple[str, str, int | None]:
    """(name, description, price in paise or None) guessed from an Instagram caption."""
    text = (caption or "").strip()
    price = None
    if m := _PRICE.search(text):
        try:
            price = round(float((m.group(1) or m.group(2)).replace(",", "")) * 100)
        except ValueError:
            price = None
    description = _HASHTAG.sub("", text).strip()
    first = next((line.strip() for line in description.splitlines() if line.strip()), "")
    name = _PRICE.sub("", first).strip(" -–|:•·,") or "Product"
    return name[:120], description[:2000], (price if price and price >= 100 else None)


async def _save_image(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID | None, url: str | None, name: str) -> str | None:
    """Instagram CDN URLs expire, so keep our own copy in the media library. Falls back to the original URL."""
    if not url:
        return None
    if not media_library.publicly_reachable():
        return url
    client = _http_factory() if _http_factory else httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0), follow_redirects=True)
    try:
        resp = await client.get(url)
        resp.raise_for_status()
        asset = await media_library.store(db, tenant_id=tenant_id, user_id=user_id, name=f"{name[:60]}.jpg", src=io.BytesIO(resp.content))
        await db.flush()
        return media_library.file_url(asset.file_name)
    except (httpx.HTTPError, media_library.MediaError) as exc:
        log.info("keeping Instagram image URL for %s: %s", name, exc)
        return url
    finally:
        if _http_factory is None:
            await client.aclose()


async def import_posts(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID | None, account: InstagramAccount, media_ids: list[str]) -> dict:
    """Turn Instagram posts into products. Posts without a price in the caption come in hidden, waiting for one."""
    existing = set((await db.execute(select(ShopProduct.media_id).where(ShopProduct.tenant_id == tenant_id, ShopProduct.media_id.in_(media_ids)))).scalars())
    client = client_for(account)
    created: list[ShopProduct] = []
    errors: list[str] = []
    for media_id in dict.fromkeys(media_ids):
        if media_id in existing:
            continue
        try:
            media = await client.get_media(media_id)
        except GraphError as exc:
            errors.append(f"{media_id}: {exc}")
            continue
        name, description, price = parse_caption(media.get("caption"))
        image = await _save_image(db, tenant_id, user_id, media.get("thumbnail_url") or media.get("media_url"), name)
        product = ShopProduct(tenant_id=tenant_id, name=name, description=description, price=price or 0, image_url=image, media_id=media_id,
                              permalink=media.get("permalink"), status="active" if price else "hidden")
        db.add(product)
        created.append(product)
    await db.commit()
    return {"created": created, "skipped": len(existing), "errors": errors}


# ---- checkout --------------------------------------------------------------------------------------------------------

async def _next_number(db: AsyncSession, shop: Shop) -> int:
    return (await db.execute(update(Shop).where(Shop.id == shop.id).values(order_seq=Shop.order_seq + 1).returning(Shop.order_seq))).scalar_one()


def shipping_for(shop: Shop, subtotal: int) -> int:
    if shop.free_shipping_above is not None and subtotal >= shop.free_shipping_above:
        return 0
    return shop.shipping_fee or 0


async def _country_code(db: AsyncSession, tenant_id: uuid.UUID) -> str:
    tenant = await db.get(Tenant, tenant_id)
    return str((tenant.settings or {}).get("default_country_code") or DEFAULT_COUNTRY_CODE) if tenant else DEFAULT_COUNTRY_CODE


async def payment_methods(db: AsyncSession, shop: Shop) -> list[str]:
    online = shop.online_payments and await payment_links.get_keys(db, shop.tenant_id) is not None
    return [m for m, on in (("online", online), ("cod", shop.cod_enabled)) if on]


MAX_LINES = 20


async def variants_of(db: AsyncSession, product_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[ShopVariant]]:
    rows = (await db.execute(select(ShopVariant).where(ShopVariant.product_id.in_(product_ids)).order_by(ShopVariant.sort, ShopVariant.created_at))).scalars().all() \
        if product_ids else []
    out: dict[uuid.UUID, list[ShopVariant]] = {pid: [] for pid in product_ids}
    for v in rows:
        out[v.product_id].append(v)
    return out


def unit_price(product: ShopProduct, variant: ShopVariant | None) -> int:
    return variant.price if variant is not None and variant.price is not None else product.price


def in_stock(product: ShopProduct, variants: list[ShopVariant]) -> bool:
    live = [v for v in variants if v.enabled]
    if product.options and live:
        return any(v.stock is None or v.stock > 0 for v in live)
    return product.stock is None or product.stock > 0


def variant_key(options: dict) -> str:
    return "|".join(f"{k.strip().lower()}={str(v).strip().lower()}" for k, v in sorted(options.items(), key=lambda kv: kv[0].lower()))


async def set_variants(db: AsyncSession, product: ShopProduct, groups: list[dict], variants: list[dict]) -> None:
    """Replace a product's option groups and variants. Variants are matched on their options, so ids (in past orders, carts) and stock survive edits."""
    product.options = groups
    existing = {v.key: v for v in (await variants_of(db, [product.id]))[product.id]}
    keep: set[str] = set()
    order = [g["name"] for g in groups]
    for i, data in enumerate(variants if groups else []):
        opts = {name: data["options"][name] for name in order}
        key = variant_key(opts)
        keep.add(key)
        v = existing.get(key) or ShopVariant(tenant_id=product.tenant_id, product_id=product.id, key=key)
        v.options, v.title = opts, " / ".join(opts[name] for name in order)[:120]
        v.price, v.stock, v.enabled, v.sort = data.get("price"), data.get("stock"), data.get("enabled", True), i
        if v.id is None:
            db.add(v)
    for key, v in existing.items():
        if key not in keep:
            await db.delete(v)
    if groups:
        product.stock = None  # tracked per variant


Line = tuple[ShopProduct, "ShopVariant | None", int]


async def resolve_lines(db: AsyncSession, shop: Shop, lines: list[dict]) -> list[Line]:
    """[{product_id, variant_id?, qty}] → checked (product, variant, qty) lines: available, a variant picked where needed, enough stock."""
    if not lines:
        raise ShopError("Your cart is empty.")
    merged: dict[tuple, int] = {}
    for line in lines:
        k = (uuid.UUID(str(line["product_id"])), uuid.UUID(str(line["variant_id"])) if line.get("variant_id") else None)
        merged[k] = merged.get(k, 0) + int(line.get("qty") or 1)
    if len(merged) > MAX_LINES:
        raise ShopError(f"You can order up to {MAX_LINES} different items at a time.")
    products = {p.id: p for p in (await db.execute(select(ShopProduct).where(ShopProduct.id.in_({k[0] for k in merged})))).scalars()}
    variants = await variants_of(db, list(products))
    out: list[Line] = []
    for (pid, vid), qty in merged.items():
        product = products.get(pid)
        if product is None or product.tenant_id != shop.tenant_id or product.status != "active" or product.price < 100:
            raise ShopError("One of the items isn't available any more." if len(merged) > 1 else "This product isn't available any more.", 404)
        live = [v for v in variants[pid] if v.enabled]
        variant = None
        if product.options and live:
            variant = next((v for v in live if v.id == vid), None)
            if variant is None:
                raise ShopError(f"Choose {' and '.join(g['name'].lower() for g in product.options)} for {product.name}.")
        if not 1 <= qty <= MAX_QTY:
            raise ShopError(f"You can order 1–{MAX_QTY} of each item.")
        stock = variant.stock if variant is not None else product.stock
        label = f"{product.name} ({variant.title})" if variant is not None else product.name
        if stock is not None and stock < qty:
            raise ShopError(f"Sorry, {label} is sold out." if stock <= 0 else f"Only {stock} of {label} left in stock.", 409)
        out.append((product, variant, qty))
    return out


async def _customer_contact(db: AsyncSession, shop: Shop, ref: str | None, phone: str, name: str, email: str | None) -> tuple[Contact | None, uuid.UUID | None]:
    """The buyer's contact: the Instagram contact from a DM link when there is one, else one keyed by phone (so store buyers land in Contacts)."""
    parsed = read_ref(ref)
    if parsed:
        contact = await db.get(Contact, parsed[0])
        if contact is not None and contact.tenant_id == shop.tenant_id:
            automation_id = parsed[1]
            if automation_id:
                a = await db.get(CommentAutomation, automation_id)
                automation_id = a.id if a is not None and a.tenant_id == shop.tenant_id else None
            await _remember_phone(db, contact, phone)
            if email and not contact.email:
                contact.email = email
            return contact, automation_id
    contact, _ = await messaging.upsert_contact_by_phone(db, shop.tenant_id, phone, name=name, source="shop", email=email)
    return contact, None


async def _remember_phone(db: AsyncSession, contact: Contact, phone: str) -> None:
    """Phones are unique per workspace: only set it when the contact has none and nobody else has it."""
    if not contact.phone:
        taken = (await db.execute(select(Contact.id).where(Contact.tenant_id == contact.tenant_id, Contact.phone == phone).limit(1))).first()
        if not taken:
            contact.phone = phone


async def checkout(db: AsyncSession, shop: Shop, *, lines: list[dict], name: str, phone: str, email: str | None, address: dict,
                   note: str, payment_method: str, ref: str | None) -> ShopOrder:
    """The store's checkout: one product, or a cart of several (with variants)."""
    resolved = await resolve_lines(db, shop, lines)
    try:
        phone = normalize_phone(phone, await _country_code(db, shop.tenant_id))
    except InvalidPhone:
        raise ShopError("Enter a valid mobile number.")
    contact, automation_id = await _customer_contact(db, shop, ref, phone, name, email)
    return await place_order(db, shop, resolved, name=name, phone=phone, email=email, address=address, note=note, payment_method=payment_method,
                             contact=contact, automation_id=automation_id, source="comment" if automation_id else "store")


def _item(product: ShopProduct, variant: ShopVariant | None, qty: int) -> dict:
    return {"product_id": str(product.id), "variant_id": str(variant.id) if variant else None, "name": product.name, "variant": variant.title if variant else None,
            "price": unit_price(product, variant), "qty": qty, "image_url": product.image_url}


def item_label(item: dict) -> str:
    return f"{item['name']} ({item['variant']})" if item.get("variant") else item["name"]


async def place_order(db: AsyncSession, shop: Shop, lines: list[Line], *, name: str, phone: str, email: str | None, address: dict, note: str,
                      payment_method: str, contact: Contact | None, automation_id: uuid.UUID | None, source: str) -> ShopOrder:
    """Create the order (store page or chat): a payment link for online orders, or confirm a COD order straight away. `phone` is normalised."""
    if payment_method not in await payment_methods(db, shop):
        if payment_method == "cod":
            raise ShopError("Cash on delivery isn't available for this store.")
        raise ShopError("Online payment isn't available for this store right now." + (" Choose cash on delivery." if shop.cod_enabled else ""), 409)

    product_ids = {p.id for p, _, _ in lines}
    recovered = False
    if contact is not None:
        # They had tapped Buy in a DM: that cart is now an order (and if we had nudged them, the reminder earned it).
        reminded = (await db.execute(update(ShopCart).where(ShopCart.contact_id == contact.id, ShopCart.product_id.in_(product_ids), ShopCart.stage != "ordered")
                                     .values(stage="ordered").returning(ShopCart.reminded_at))).scalars().all()
        recovered = any(r is not None for r in reminded)
    items = [_item(p, v, q) for p, v, q in lines]
    subtotal = sum(i["price"] * i["qty"] for i in items)
    shipping = shipping_for(shop, subtotal)
    order = ShopOrder(
        tenant_id=shop.tenant_id, number=await _next_number(db, shop), access_token=secrets.token_urlsafe(24), items=items,
        subtotal=subtotal, shipping=shipping, total=subtotal + shipping, currency="INR", customer_name=name, customer_phone=phone, customer_email=email,
        address=address, note=note, contact_id=contact.id if contact else None, source=source, automation_id=automation_id,
        payment_method=payment_method, payment_status="cod" if payment_method == "cod" else "pending", recovered=recovered,
    )
    db.add(order)
    await db.flush()
    if contact is not None:
        await db.execute(update(ShopCart).where(ShopCart.contact_id == contact.id, ShopCart.product_id.in_(product_ids)).values(order_id=order.id))

    if payment_method == "online":
        try:
            link = await payment_links.create(
                db, shop.tenant_id, None, amount=order.total, currency=order.currency, description=f"{shop.name} · order #{order.number}",
                contact_id=order.contact_id, deal_id=None, expire_days=2, customer={"name": name, "contact": f"+{phone}", "email": email},
                callback_url=order_url(shop, order))
        except payment_links.LinkError as exc:
            await db.rollback()
            log.warning("shop checkout for tenant %s could not create a payment link: %s", shop.tenant_id, exc.message)
            raise ShopError("We couldn't start the payment. Please try again in a minute.", 502)
        order.payment_link_id, order.pay_url = link.id, link.short_url
        await db.commit()
    else:
        await db.commit()
        # Orders placed in chat were just confirmed by the buyer; web COD orders from Instagram buyers get asked first.
        await confirm(db, order, ask_cod=source != "chat")
    await outbound_webhooks.emit(shop.tenant_id, "order_placed", order_event(order))
    return order


def order_event(order: ShopOrder) -> dict:
    return {"order_id": str(order.id), "number": order.number, "total": order.total, "currency": order.currency, "payment_method": order.payment_method,
            "payment_status": order.payment_status, "status": order.status, "customer_name": order.customer_name, "customer_phone": order.customer_phone,
            "items": order.items, "contact_id": str(order.contact_id) if order.contact_id else None, "source": order.source}


# ---- after payment -------------------------------------------------------------------------------------------------

async def on_link_paid(db: AsyncSession, link: PaymentLink) -> None:
    """Called by payment_links.mark_paid (webhook, poller or a manual refresh) the first time a link is paid."""
    order = (await db.execute(select(ShopOrder).where(ShopOrder.payment_link_id == link.id))).scalar_one_or_none()
    if order is None or order.payment_status == "paid":
        return
    order.payment_status, order.paid_at = "paid", link.paid_at or utcnow()
    order.recovered = order.recovered or order.reminded_at is not None
    await db.commit()
    await confirm(db, order)
    await outbound_webhooks.emit(order.tenant_id, "order_paid", order_event(order))


async def _count(db: AsyncSession, order: ShopOrder, sign: int) -> None:
    """Apply (+1) or undo (-1) what an order did to stock and the sales counters."""
    for item in order.items or []:
        pid, qty = uuid.UUID(item["product_id"]), int(item["qty"])
        await db.execute(update(ShopProduct).where(ShopProduct.id == pid).values(
            orders_count=ShopProduct.orders_count + sign, revenue=ShopProduct.revenue + sign * item["price"] * qty))
        if item.get("variant_id"):
            await db.execute(update(ShopVariant).where(ShopVariant.id == uuid.UUID(item["variant_id"]), ShopVariant.stock.is_not(None)).values(
                stock=func.greatest(ShopVariant.stock - sign * qty, 0)))
        else:
            await db.execute(update(ShopProduct).where(ShopProduct.id == pid, ShopProduct.stock.is_not(None)).values(
                stock=func.greatest(ShopProduct.stock - sign * qty, 0)))
    if order.automation_id:
        await db.execute(update(CommentAutomation).where(CommentAutomation.id == order.automation_id).values(
            orders=CommentAutomation.orders + sign, revenue=CommentAutomation.revenue + sign * order.total))


async def confirm(db: AsyncSession, order: ShopOrder, *, ask_cod: bool = False) -> None:
    """Runs once, when an order is paid or placed as COD: stock, counters, the buyer's tags, and the confirmation DM
    (or, for COD with `ask_cod`, a "Confirm / Cancel" DM first — the order stays `new` until they answer)."""
    await _count(db, order, +1)
    await _assign_invoice_number(db, order)
    contact = await db.get(Contact, order.contact_id) if order.contact_id else None
    if contact is not None:
        contact.tags = sorted({*(contact.tags or []), "customer"})
    await db.commit()
    if contact is not None and ask_cod and order.payment_method == "cod" and await _ask_cod(db, order, contact):
        return
    if order.status == "new":
        order.status = "confirmed"
        await db.commit()
    if contact is not None:
        await _send_confirmation(db, order, contact)


async def cancel(db: AsyncSession, order: ShopOrder) -> None:
    """Cancel an order and give back its stock / counters if it had been counted. Refunds of online payments are done in Razorpay."""
    if order.status == "cancelled":
        return
    if order.payment_status in ("paid", "cod"):
        await _count(db, order, -1)
    order.status = "cancelled"
    await db.commit()
    await outbound_webhooks.emit(order.tenant_id, "order_cancelled", order_event(order))


def render(template: str, order: ShopOrder, shop: Shop) -> str:
    first = (order.customer_name or "").split(" ")[0] or "there"
    return ((template or DEFAULT_CONFIRMATION).replace("{{name}}", first).replace("{{order}}", str(order.number))
            .replace("{{total}}", inr(order.total)).replace("{{link}}", order_url(shop, order)))


async def _dm_context(db: AsyncSession, tenant_id: uuid.UUID, contact: Contact) -> tuple[Shop, InstagramAccount, Conversation] | None:
    shop = await shop_for(db, tenant_id)
    account = await db.get(InstagramAccount, shop.account_id) if shop and shop.account_id else None
    if shop is None or account is None or not contact.ig_user_id:
        return None
    conv, _ = await messaging.get_or_create_conversation(db, account, contact)
    return shop, account, conv


async def _send_confirmation(db: AsyncSession, order: ShopOrder, contact: Contact) -> None:
    ctx = await _dm_context(db, order.tenant_id, contact)
    if ctx is None or order.confirmation_sent:
        return
    shop, account, conv = ctx
    try:
        msg = await messaging.send_message(db, account, conv, contact, kind="buttons", text=render(shop.confirmation_message, order, shop),
                                           buttons=[{"title": "View order", "url": order_url(shop, order)}], sender_type="bot",
                                           extra_payload={"auto": "shop_order", "order_id": str(order.id)}, strict=False)
    except messaging.SendBlocked as exc:
        log.info("order %s confirmation DM not sent: %s", order.id, exc.message)
        return
    if msg.status == "sent":
        order.confirmation_sent = True
        await db.commit()


async def _ask_cod(db: AsyncSession, order: ShopOrder, contact: Contact) -> bool:
    """Ask an Instagram buyer to confirm their COD order. False when the store doesn't ask, or the DM can't go out."""
    ctx = await _dm_context(db, order.tenant_id, contact)
    if ctx is None or not ctx[0].cod_confirmation:
        return False
    _, account, conv = ctx
    items = ", ".join(f"{item_label(i)} × {i['qty']}" for i in order.items or [])
    try:
        msg = await messaging.send_message(
            db, account, conv, contact, kind="buttons", sender_type="bot", strict=False, extra_payload={"auto": "shop_cod_confirm", "order_id": str(order.id)},
            text=f"Hi {order.customer_name.split(' ')[0]}! Please confirm your cash-on-delivery order #{order.number} 🙏\n\n{items}\nPay {inr(order.total)} on delivery.",
            buttons=[{"title": "✅ Confirm order", "payload": f"{COD_PREFIX}yes:{order.id}"}, {"title": "❌ Cancel order", "payload": f"{COD_PREFIX}no:{order.id}"}])
    except messaging.SendBlocked:
        return False
    if msg.status != "sent":
        return False
    order.cod_confirmation = "asked"
    await db.commit()
    return True


# ---- in the DM: Buy taps, ordering in chat, COD confirmations --------------------------------------------------------

ASK_DETAILS = ("Please send your delivery details in one message 📦\n\nName\nMobile number\nFull address with pincode\n\n"
               "For example:\nPriya Sharma\n98765 43210\nFlat 4B, Green Park, MG Road, Pune 411001")
_MOBILE = re.compile(r"(?<!\d)(?:\+?91[\s-]*)?[6-9]\d{4}[\s-]?\d{5}(?!\d)")
_PINCODE = re.compile(r"(?<!\d)[1-9]\d{5}(?!\d)")
MAX_ADDRESS_ATTEMPTS = 3
DEFAULT_REMINDER = "Still thinking about {{product}}? 👀 Tap below to grab yours before it's gone."


def buy_button(automation: CommentAutomation) -> dict:
    return {"title": (automation.buy_button or DEFAULT_BUY_BUTTON)[:20], "payload": f"{BUY_PREFIX}{automation.id}"}


async def shop_for(db: AsyncSession, tenant_id: uuid.UUID) -> Shop | None:
    return (await db.execute(select(Shop).where(Shop.tenant_id == tenant_id))).scalar_one_or_none()


def parse_details(text: str, country_code: str) -> dict | None:
    """Name, mobile and address (with pincode) from one free-text message. None if the mobile number or pincode is missing."""
    m = _MOBILE.search(text or "")
    if not m:
        return None
    try:
        phone = normalize_phone(m.group(0), country_code)
    except InvalidPhone:
        return None
    rest = (text[:m.start()] + "\n" + text[m.end():])
    pin = _PINCODE.search(rest)
    if not pin:
        return None
    rest = rest[:pin.start()] + rest[pin.end():]
    lines = [re.sub(r"\s+", " ", line).strip(" ,.-:") for line in rest.splitlines()]
    lines = [line for line in lines if line and line.lower() not in {"name", "address", "phone", "mobile", "pincode"}]
    name = lines[0] if len(lines) > 1 and not any(ch.isdigit() for ch in lines[0]) and len(lines[0]) <= 60 else None
    address = ", ".join(lines[1:] if name else lines)
    if len(address) < 8:
        return None
    return {"name": name, "phone": phone, "address": {"line1": address[:200], "line2": "", "city": "", "state": "", "pincode": pin.group(0)}}


def _buyer_name(details: dict, contact: Contact) -> str:
    if details.get("name"):
        return details["name"]
    if contact.name and not contact.name.startswith(("@", "Instagram user", "+")):
        return contact.name
    return contact.ig_username or "Instagram customer"


def _address_line(details: dict) -> str:
    a = details.get("address") or {}
    return ", ".join(x for x in (a.get("line1"), a.get("line2"), a.get("city"), a.get("state"), a.get("pincode")) if x)


async def handle_message(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, msg: Message) -> bool:
    """Called by the DM dispatcher before anything else. True when the message was part of buying (and has been answered)."""
    reply_id = str((msg.payload or {}).get("reply_id") or "")
    try:
        if reply_id.startswith(BUY_PREFIX):
            return await _buy_tap(db, account, conv, contact, reply_id[len(BUY_PREFIX):])
        if reply_id.startswith(SHOP_PREFIX):
            return await _cart_action(db, account, conv, contact, reply_id[len(SHOP_PREFIX):])
        if reply_id.startswith(COD_PREFIX):
            return await _cod_reply(db, account, conv, contact, reply_id[len(COD_PREFIX):])
        if msg.type == "text" and any(ch.isdigit() for ch in msg.body or ""):  # questions without numbers go to the normal replies
            if await _cart_text(db, account, conv, contact, msg.body or ""):
                return True
        if msg.type == "text" and _TRACK.search(msg.body or ""):
            return await _track_reply(db, account, conv, contact)
    except messaging.SendBlocked as exc:
        log.info("shop reply to %s blocked: %s", contact.id, exc.message)
        return True
    return False


async def _say(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, text: str, buttons: list[dict] | None = None,
               options: list[dict] | None = None, **extra) -> None:
    """A bot DM: with link/postback `buttons` (max 3), or with quick-reply `options` (max 13)."""
    await messaging.send_message(db, account, conv, contact, kind="buttons" if buttons else "text", text=text, buttons=buttons, options=options, sender_type="bot",
                                 extra_payload={"auto": "shop", **{k: str(v) for k, v in extra.items()}}, strict=False)


def _cart_buttons(shop: Shop, product: ShopProduct, cart: ShopCart, contact: Contact) -> list[dict]:
    buttons = [{"title": "Checkout", "url": product_url(shop, product, make_ref(contact.id, cart.automation_id))}]
    if shop.chat_orders:
        buttons.append({"title": "💬 Order in chat", "payload": f"{SHOP_PREFIX}chat:{cart.id}"})
    return buttons


def _price_line(product: ShopProduct, variants: list[ShopVariant]) -> str:
    prices = sorted({unit_price(product, v) for v in variants if v.enabled}) if product.options else []
    if len(prices) > 1:
        return f"From {inr(prices[0])}"
    price = prices[0] if prices else product.price
    mrp = f" (MRP {inr(product.compare_at_price)})" if product.compare_at_price and product.compare_at_price > price else ""
    return f"{inr(price)}{mrp}"


async def _buy_tap(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, automation_ref: str) -> bool:
    """A "Buy now" tap gets the product card, a personal checkout link, and the option to order right here in chat."""
    try:
        automation = await db.get(CommentAutomation, uuid.UUID(automation_ref))
    except ValueError:
        return False
    if automation is None or automation.tenant_id != contact.tenant_id:
        return False
    product = await db.get(ShopProduct, automation.product_id) if automation.product_id else None
    shop = await shop_for(db, contact.tenant_id)
    variants = (await variants_of(db, [product.id]))[product.id] if product else []
    if product is None or shop is None or not shop.published or product.status != "active" or not in_stock(product, variants):
        await _say(db, account, conv, contact, "Sorry, this one isn't available right now 🙏 We'll let you know when it's back!", automation_id=automation.id)
        return True
    stmt = (pg_insert(ShopCart)
            .values(id=uuid.uuid4(), tenant_id=contact.tenant_id, contact_id=contact.id, conversation_id=conv.id, product_id=product.id, automation_id=automation.id,
                    stage="browsing", details={}, attempts=0)
            .on_conflict_do_update(constraint="uq_shop_carts_contact_product", set_={
                "stage": "browsing", "automation_id": automation.id, "conversation_id": conv.id, "attempts": 0, "reminded_at": None, "order_id": None,
                "details": {}, "updated_at": func.now()})
            .returning(ShopCart.id))
    cart = await db.get(ShopCart, (await db.execute(stmt)).scalar_one())
    await db.refresh(cart)
    if product.image_url:
        await messaging.send_message(db, account, conv, contact, kind="image", media_url=product.image_url, sender_type="bot", strict=False,
                                     extra_payload={"auto": "shop_buy", "automation_id": str(automation.id)})
    choices = " · ".join(f"{g['name']}: {', '.join(g['values'][:8])}" for g in product.options or [])
    how = "Tap Checkout to order on our store" + (", or order right here in chat" if shop.chat_orders else "")
    pay = {("online", "cod"): "UPI, card or cash on delivery", ("online",): "UPI or card", ("cod",): "cash on delivery"}.get(tuple(await payment_methods(db, shop)))
    await _say(db, account, conv, contact, f"{product.name}\n{_price_line(product, variants)}" + (f"\n{choices}" if choices else "") +
               f"\n\n{how}" + (f" — {pay}" if pay else "") + " 👇",
               _cart_buttons(shop, product, cart, contact), automation_id=automation.id, product_id=product.id)
    return True


async def _load_cart(db: AsyncSession, contact: Contact, cart_ref: str) -> ShopCart | None:
    try:
        cart = await db.get(ShopCart, uuid.UUID(cart_ref))
    except ValueError:
        return None
    return cart if cart is not None and cart.contact_id == contact.id else None


CHOICE_KEYS = ("variant_id", "qty")  # what the buyer picked; kept when they change the address


def _choices(cart: ShopCart) -> dict:
    return {k: v for k, v in (cart.details or {}).items() if k in CHOICE_KEYS}


async def _next_step(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, shop: Shop, product: ShopProduct,
                     variants: list[ShopVariant], cart: ShopCart) -> None:
    """Ask for whatever is still missing — variant, quantity, then the delivery address — or show the summary."""
    d = cart.details or {}
    live = [v for v in variants if v.enabled and (v.stock is None or v.stock > 0)]
    if product.options and live and not d.get("variant_id"):
        cart.stage = "browsing"
        await db.commit()
        await _say(db, account, conv, contact, f"Which {' / '.join(g['name'].lower() for g in product.options)} would you like?",
                   options=[{"title": f"{v.title}"[:20], "payload": f"{SHOP_PREFIX}var:{cart.id}:{v.id}"} for v in live[:13]])
        return
    if not d.get("qty"):
        variant = next((v for v in variants if str(v.id) == d.get("variant_id")), None)
        stock = variant.stock if variant is not None else product.stock
        top = min(5, MAX_QTY, stock if stock is not None else 5)
        if top <= 1:
            cart.details = {**d, "qty": 1}
        else:
            await db.commit()
            await _say(db, account, conv, contact, "How many would you like?", options=[{"title": str(n), "payload": f"{SHOP_PREFIX}qty:{cart.id}:{n}"} for n in range(1, top + 1)])
            return
    d = cart.details
    if not d.get("phone"):
        last = (await db.execute(select(ShopOrder).where(ShopOrder.contact_id == contact.id).order_by(ShopOrder.created_at.desc()).limit(1))).scalar_one_or_none()
        cart.stage = "address"
        if last is not None:
            cart.details = {**_choices(cart), "saved": {"name": last.customer_name, "phone": last.customer_phone, "address": last.address or {}}}
            await db.commit()
            await _say(db, account, conv, contact, f"Deliver to the same address as last time?\n\n📍 {last.customer_name}, {_address_line(cart.details['saved'])}\n📞 +{last.customer_phone}",
                       [{"title": "✅ Yes, same address", "payload": f"{SHOP_PREFIX}same:{cart.id}"}, {"title": "✏️ New address", "payload": f"{SHOP_PREFIX}new:{cart.id}"}])
            return
        await db.commit()
        await _say(db, account, conv, contact, ASK_DETAILS)
        return
    await _review(db, account, conv, contact, shop, product, variants, cart)


async def _cart_action(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, ref: str) -> bool:
    action, _, rest = ref.partition(":")
    cart_ref, _, arg = rest.partition(":")
    cart = await _load_cart(db, contact, cart_ref)
    shop = await shop_for(db, contact.tenant_id)
    if cart is None or shop is None:
        return False
    product = await db.get(ShopProduct, cart.product_id)
    if product is None or product.status != "active" or not shop.published:
        await _say(db, account, conv, contact, "Sorry, this one isn't available right now 🙏")
        return True
    if cart.stage == "ordered" and action in ("pay", "cod"):
        await _say(db, account, conv, contact, "This order is already placed ✅ Check the message above for the details.")
        return True
    variants = (await variants_of(db, [product.id]))[product.id]

    if action == "chat":
        cart.details, cart.attempts = {}, 0
    elif action == "var":
        variant = next((v for v in variants if str(v.id) == arg and v.enabled), None)
        if variant is None or (variant.stock is not None and variant.stock <= 0):
            await _say(db, account, conv, contact, "Sorry, that one just sold out 🙈 Please pick another.")
            cart.details = {k: v for k, v in (cart.details or {}).items() if k != "variant_id"}
        else:
            cart.details = {**(cart.details or {}), "variant_id": str(variant.id), "qty": None}
    elif action == "qty" and arg.isdigit():
        cart.details = {**(cart.details or {}), "qty": max(1, min(MAX_QTY, int(arg)))}
    elif action == "new":
        cart.details, cart.attempts = _choices(cart), 0
        cart.stage = "address"
        await db.commit()
        await _say(db, account, conv, contact, ASK_DETAILS)
        return True
    elif action == "same" and (cart.details or {}).get("saved"):
        cart.details = {**_choices(cart), **cart.details["saved"]}
    elif action in ("pay", "cod") and cart.stage == "review" and (cart.details or {}).get("phone"):
        d = cart.details
        try:
            lines = await resolve_lines(db, shop, [{"product_id": product.id, "variant_id": d.get("variant_id"), "qty": d.get("qty") or 1}])
            order = await place_order(db, shop, lines, name=_buyer_name(d, contact), phone=d["phone"], email=contact.email, address=d["address"], note="",
                                      payment_method="online" if action == "pay" else "cod", contact=contact, automation_id=cart.automation_id, source="chat")
        except ShopError as exc:
            await _say(db, account, conv, contact, f"Sorry — {exc.message}")
            return True
        await _remember_phone(db, contact, d["phone"])
        await db.commit()
        if order.pay_url:
            await _say(db, account, conv, contact, f"Order #{order.number} is reserved for you 🎉\nPay {inr(order.total)} securely here 👇",
                       [{"title": f"Pay {inr(order.total)}"[:20], "url": order.pay_url}], order_id=order.id)
        return True  # COD: the confirmation DM went out from confirm()
    else:
        return False
    await _next_step(db, account, conv, contact, shop, product, variants, cart)
    return True


async def _review(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, shop: Shop, product: ShopProduct,
                  variants: list[ShopVariant], cart: ShopCart) -> None:
    cart.stage, cart.attempts = "review", 0
    await db.commit()
    methods = await payment_methods(db, shop)
    if not methods:
        await _say(db, account, conv, contact, "Sorry, we can't take orders right now 🙏 Please try again later.")
        return
    d = cart.details
    variant = next((v for v in variants if str(v.id) == d.get("variant_id")), None)
    qty = int(d.get("qty") or 1)
    subtotal = unit_price(product, variant) * qty
    shipping = shipping_for(shop, subtotal)
    label = f"{product.name} ({variant.title})" if variant else product.name
    buttons = ([{"title": "💳 Pay online", "payload": f"{SHOP_PREFIX}pay:{cart.id}"}] if "online" in methods else []) + \
              ([{"title": "💵 Cash on delivery", "payload": f"{SHOP_PREFIX}cod:{cart.id}"}] if "cod" in methods else []) + \
              [{"title": "✏️ Change address", "payload": f"{SHOP_PREFIX}new:{cart.id}"}]
    await _say(db, account, conv, contact,
               f"🧾 {label} × {qty} — {inr(subtotal)}\nDelivery: {inr(shipping) if shipping else 'Free'}\nTotal: {inr(subtotal + shipping)}\n\n"
               f"📍 {_buyer_name(d, contact)}, {_address_line(d)}\n📞 +{d['phone']}\n\nHow would you like to pay?", buttons)


async def _cart_text(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, text: str) -> bool:
    """A message while we're waiting for their delivery details."""
    cart = (await db.execute(select(ShopCart).where(ShopCart.contact_id == contact.id, ShopCart.stage == "address",
                                                    ShopCart.updated_at > utcnow() - messaging.WINDOW).order_by(ShopCart.updated_at.desc()).limit(1))).scalar_one_or_none()
    shop = await shop_for(db, contact.tenant_id) if cart else None
    product = await db.get(ShopProduct, cart.product_id) if cart else None
    if cart is None or shop is None or product is None:
        return False
    details = parse_details(text, await _country_code(db, contact.tenant_id))
    if details is None:
        cart.attempts = (cart.attempts or 0) + 1
        if cart.attempts >= MAX_ADDRESS_ATTEMPTS:
            cart.stage = "browsing"
            await db.commit()
            await _say(db, account, conv, contact, "No worries — you can also order on our store in a few taps 👇", _cart_buttons(shop, product, cart, contact)[:1])
        else:
            await db.commit()
            await _say(db, account, conv, contact, "I couldn't quite read that 🙈 Please include your 10-digit mobile number and your 6-digit pincode.")
        return True
    cart.details = {**_choices(cart), **details}
    await _next_step(db, account, conv, contact, shop, product, (await variants_of(db, [product.id]))[product.id], cart)
    return True


async def _cod_reply(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact, ref: str) -> bool:
    answer, _, order_ref = ref.partition(":")
    try:
        order = await db.get(ShopOrder, uuid.UUID(order_ref))
    except ValueError:
        return False
    if order is None or order.contact_id != contact.id:
        return False
    if order.cod_confirmation != "asked" or order.status not in ("new", "confirmed"):
        await _say(db, account, conv, contact, f"Order #{order.number} is {order.status} — thanks!")
        return True
    if answer == "yes":
        order.cod_confirmation, order.status = "confirmed", "confirmed"
        await db.commit()
        await _send_confirmation(db, order, contact)
    else:
        order.cod_confirmation = "declined"
        await cancel(db, order)
        await _say(db, account, conv, contact, f"No problem — order #{order.number} is cancelled. You can order again anytime 🙂", order_id=order.id)
    return True


# ---- reminders (scheduler) ------------------------------------------------------------------------------------------

async def send_reminders(limit: int = 50) -> int:
    """One nudge, inside Instagram's 24h window, for (a) people who tapped Buy but didn't order and (b) online orders left unpaid."""
    sent = 0
    async with db_session.async_session_factory() as db:
        now = utcnow()
        quiet = Shop.reminder_after_minutes * literal_column("interval '1 minute'")
        window = now - messaging.WINDOW + timedelta(minutes=30)  # leave room before the window closes
        carts = (await db.execute(select(ShopCart.id).join(Shop, Shop.tenant_id == ShopCart.tenant_id).where(
            Shop.reminders_enabled.is_(True), Shop.published.is_(True), ShopCart.stage.in_(("browsing", "address", "review")),
            ShopCart.reminded_at.is_(None), ShopCart.updated_at < func.now() - quiet, ShopCart.updated_at > window).limit(limit))).scalars().all()
        for cart_id in carts:
            sent += await _remind_cart(db, cart_id)
        orders = (await db.execute(select(ShopOrder.id).join(Shop, Shop.tenant_id == ShopOrder.tenant_id).where(
            Shop.reminders_enabled.is_(True), ShopOrder.payment_status == "pending", ShopOrder.status == "new", ShopOrder.pay_url.is_not(None),
            ShopOrder.contact_id.is_not(None), ShopOrder.reminded_at.is_(None), ShopOrder.created_at < func.now() - quiet,
            ShopOrder.created_at > window).limit(limit))).scalars().all()
        for order_id in orders:
            sent += await _remind_order(db, order_id)
    return sent


async def _remind_cart(db: AsyncSession, cart_id: uuid.UUID) -> int:
    try:
        cart = await db.get(ShopCart, cart_id)
        contact = await db.get(Contact, cart.contact_id)
        product = await db.get(ShopProduct, cart.product_id)
        cart.reminded_at = utcnow()  # first, so a failing send is never retried in a loop
        await db.commit()
        ctx = await _dm_context(db, cart.tenant_id, contact) if contact else None
        if ctx is None or product is None or product.status != "active" or not in_stock(product, (await variants_of(db, [product.id]))[product.id]):
            return 0
        shop, account, conv = ctx
        text = (shop.reminder_message or DEFAULT_REMINDER).replace("{{product}}", product.name).replace("{{name}}", _buyer_name({}, contact).split(" ")[0])
        await _say(db, account, conv, contact, text, _cart_buttons(shop, product, cart, contact), reminder="cart")
        return 1
    except messaging.SendBlocked as exc:
        log.info("cart reminder %s not sent: %s", cart_id, exc.message)
    except Exception:  # noqa: BLE001
        log.exception("cart reminder %s failed", cart_id)
        await db.rollback()
    return 0


async def _remind_order(db: AsyncSession, order_id: uuid.UUID) -> int:
    try:
        order = await db.get(ShopOrder, order_id)
        contact = await db.get(Contact, order.contact_id)
        order.reminded_at = utcnow()
        await db.commit()
        ctx = await _dm_context(db, order.tenant_id, contact) if contact else None
        if ctx is None:
            return 0
        _, account, conv = ctx
        await _say(db, account, conv, contact, f"Your order #{order.number} ({inr(order.total)}) is waiting for payment ⏳ Complete it here before it expires 👇",
                   [{"title": f"Pay {inr(order.total)}"[:20], "url": order.pay_url}], reminder="order", order_id=order.id)
        return 1
    except messaging.SendBlocked as exc:
        log.info("payment reminder for order %s not sent: %s", order_id, exc.message)
    except Exception:  # noqa: BLE001
        log.exception("payment reminder for order %s failed", order_id)
        await db.rollback()
    return 0


# ---- shipping & tracking ----------------------------------------------------------------------------------------------
# Instagram only lets a business DM someone within 24h of their last message, and parcels usually ship later than that. So shipping
# DMs go out when the window happens to be open, the order page always shows the tracking, and anyone who DMs "track" gets their
# order status straight away (their message opens the window).

_TRACK = re.compile(r"\b(track|tracking|order status|where'?s my order|where is my order|kab (?:aayega|ayega|milega|aaega)|kaha[n]? (?:hai|h|pahuncha)|parcel|delivery status|awb)\b",
                    re.IGNORECASE)
STATUS_LABEL = {"new": "placed", "confirmed": "confirmed — being packed", "shipped": "on its way 🚚", "delivered": "delivered ✅", "returned": "returned to us",
                "cancelled": "cancelled"}


async def _notify(db: AsyncSession, order: ShopOrder, event: str) -> bool:
    """Best-effort shipping DM. False when it can't go out (no Instagram buyer, or outside the 24h window)."""
    contact = await db.get(Contact, order.contact_id) if order.contact_id else None
    ctx = await _dm_context(db, order.tenant_id, contact) if contact else None
    if ctx is None:
        return False
    shop, account, conv = ctx
    track = order.tracking_url or order_url(shop, order)
    texts = {
        "shipped": f"📦 Your order #{order.number} is on its way!" + (f"\nCourier: {order.courier}" if order.courier else "") + (f" · AWB {order.awb}" if order.awb else ""),
        "out_for_delivery": f"🛵 Your order #{order.number} is out for delivery today — please keep your phone handy!",
        "delivered": f"✅ Order #{order.number} has been delivered. Hope you love it 💖 Reply here if anything isn't right.",
    }
    try:
        await _say(db, account, conv, contact, texts[event], [{"title": "Track order" if event != "delivered" else "View order", "url": track}],
                   order_id=order.id, shipping=event)
    except messaging.SendBlocked as exc:
        log.info("order %s %s DM not sent: %s", order.id, event, exc.message)
        return False
    return True


async def mark_shipped(db: AsyncSession, order: ShopOrder, *, courier: str | None, awb: str | None, tracking: str | None) -> None:
    if order.status in ("cancelled", "returned") or order.payment_status == "pending":
        raise ShopError("Only confirmed, paid or COD orders can be shipped.", 409)
    order.courier, order.awb, order.tracking_url = courier or order.courier, awb or order.awb, tracking or order.tracking_url
    first = order.status != "shipped"
    order.status, order.shipped_at = "shipped", order.shipped_at or utcnow()
    if order.cod_confirmation == "asked":
        order.cod_confirmation = "confirmed"
    await db.commit()
    if first:
        await _notify(db, order, "shipped")
        await outbound_webhooks.emit(order.tenant_id, "order_shipped", {**order_event(order), "courier": order.courier, "awb": order.awb, "tracking_url": order.tracking_url})


async def mark_delivered(db: AsyncSession, order: ShopOrder) -> None:
    if order.status == "delivered":
        return
    if order.status in ("cancelled", "returned"):
        raise ShopError("This order was cancelled or returned.", 409)
    order.status, order.delivered_at = "delivered", utcnow()
    if order.payment_method == "cod" and order.payment_status == "cod":
        order.payment_status, order.paid_at = "paid", order.paid_at or utcnow()  # cash was collected on delivery
    await db.commit()
    await _notify(db, order, "delivered")
    await outbound_webhooks.emit(order.tenant_id, "order_delivered", order_event(order))


def _shiprocket_body(order: ShopOrder, address: dict) -> dict:
    name = (order.customer_name or "Customer").split(" ", 1)
    ist = (order.created_at or utcnow()).astimezone(timezone(timedelta(hours=5, minutes=30)))
    return {
        "order_id": f"GFG-{order.number}", "order_date": ist.strftime("%Y-%m-%d %H:%M"), "billing_customer_name": name[0], "billing_last_name": name[1] if len(name) > 1 else "",
        "billing_address": address.get("line1", ""), "billing_address_2": address.get("line2", ""), "billing_city": address.get("city", ""),
        "billing_pincode": address.get("pincode", ""), "billing_state": address.get("state", ""), "billing_country": "India", "billing_email": order.customer_email or "",
        "billing_phone": order.customer_phone[-10:], "shipping_is_billing": True,
        "order_items": [{"name": item_label(i)[:100], "sku": f"GFG-{(i.get('variant_id') or i['product_id'])[:8]}", "units": i["qty"], "selling_price": i["price"] / 100}
                        for i in order.items or []],
        "payment_method": "COD" if order.payment_method == "cod" and order.payment_status != "paid" else "Prepaid",
        "shipping_charges": order.shipping / 100, "sub_total": order.subtotal / 100,
    }


async def ship_with_shiprocket(db: AsyncSession, order: ShopOrder, *, city: str | None = None, state: str | None = None, package: dict | None = None) -> bool:
    """Push the order to Shiprocket and get an AWB. True once it's shipped; False if Shiprocket made the order but couldn't assign a courier yet."""
    from app.services import shiprocket  # local: keeps the Shiprocket client out of the DM hot path
    if order.status in ("cancelled", "returned", "delivered") or order.payment_status == "pending":
        raise ShopError("Only confirmed, paid or COD orders can be shipped.", 409)
    address = {**(order.address or {})}
    if city:
        address["city"] = city.strip()
    if state:
        address["state"] = state.strip()
    if not (address.get("city") and address.get("state") and address.get("pincode")):
        raise ShopError("Shiprocket needs the city, state and pincode — fill in the missing ones.")
    order.address = address
    try:
        r = await shiprocket.ship(db, order.tenant_id, _shiprocket_body(order, address), package, shipment_id=order.shiprocket_shipment_id)
    except shiprocket.ShiprocketError as exc:
        await db.rollback()
        raise ShopError(f"Shiprocket: {exc.message}", 409 if exc.status == 409 else 502)
    order.shiprocket_order_id = r["order_id"] or order.shiprocket_order_id
    order.shiprocket_shipment_id = r["shipment_id"]
    await db.commit()
    if not r["awb"]:
        return False
    await mark_shipped(db, order, courier=r["courier"], awb=r["awb"], tracking=shiprocket.tracking_url(r["awb"]))
    return True


async def courier_update(db: AsyncSession, tenant_id: uuid.UUID, payload: dict) -> str:
    """A Shiprocket tracking webhook. Returns what happened (for logs/tests)."""
    awb = str(payload.get("awb") or "").strip()
    order = None
    if awb:
        order = (await db.execute(select(ShopOrder).where(ShopOrder.tenant_id == tenant_id, ShopOrder.awb == awb))).scalar_one_or_none()
    channel = str(payload.get("order_id") or "")
    if order is None and channel.startswith("GFG-") and channel[4:].isdigit():
        order = (await db.execute(select(ShopOrder).where(ShopOrder.tenant_id == tenant_id, ShopOrder.number == int(channel[4:])))).scalar_one_or_none()
    if order is None:
        return "unknown_order"
    status = str(payload.get("current_status") or payload.get("shipment_status") or "").upper().strip()
    previous = order.courier_status
    order.courier_status = status[:60] or previous
    if awb and not order.awb:
        order.awb, order.tracking_url = awb, order.tracking_url or f"https://shiprocket.co/tracking/{awb}"
    if payload.get("courier_name") and not order.courier:
        order.courier = str(payload["courier_name"])[:80]
    await db.commit()
    if order.status in ("cancelled",):
        return "ignored"
    if "RTO" in status or "RETURN" in status:
        if order.status != "returned":
            order.status = "returned"
            await db.commit()
            await outbound_webhooks.emit(order.tenant_id, "order_returned", order_event(order))
        return "returned"
    if status == "DELIVERED":
        await mark_delivered(db, order)
        return "delivered"
    if status in ("OUT FOR DELIVERY", "OUT_FOR_DELIVERY"):
        if order.status != "shipped" and order.payment_status != "pending":
            await mark_shipped(db, order, courier=None, awb=None, tracking=None)
        if previous != status:
            await _notify(db, order, "out_for_delivery")
        return "out_for_delivery"
    if status in ("PICKED UP", "SHIPPED", "IN TRANSIT", "IN-TRANSIT", "REACHED AT DESTINATION HUB") and order.status in ("new", "confirmed") and order.payment_status != "pending":
        await mark_shipped(db, order, courier=None, awb=None, tracking=None)
        return "shipped"
    return "noted"


async def _track_reply(db: AsyncSession, account: InstagramAccount, conv: Conversation, contact: Contact) -> bool:
    orders = (await db.execute(select(ShopOrder).where(ShopOrder.contact_id == contact.id, ShopOrder.created_at > utcnow() - timedelta(days=60))
                               .order_by(ShopOrder.created_at.desc()).limit(3))).scalars().all()
    shop = await shop_for(db, contact.tenant_id)
    if not orders or shop is None:
        return False
    lines = []
    for o in orders:
        label = "waiting for payment" if o.payment_status == "pending" and o.status == "new" else STATUS_LABEL.get(o.status, o.status)
        extra = f" — {o.courier or 'courier'} AWB {o.awb}" if o.awb and o.status == "shipped" else ""
        if o.courier_status and o.status == "shipped":
            extra += f" ({o.courier_status.title()})"
        lines.append(f"#{o.number} · {', '.join(item_label(i) for i in o.items or [])[:60]}: {label}{extra}")
    latest = orders[0]
    await _say(db, account, conv, contact, "Here's where your order is 👇\n\n" + "\n".join(lines),
               [{"title": "Track order", "url": latest.tracking_url or order_url(shop, latest)}], order_id=latest.id)
    return True


# ---- GST invoice ------------------------------------------------------------------------------------------------------

async def _assign_invoice_number(db: AsyncSession, order: ShopOrder) -> None:
    if order.invoice_number:
        return
    from app.services.billing import financial_year
    seq = (await db.execute(update(Shop).where(Shop.tenant_id == order.tenant_id).values(invoice_seq=Shop.invoice_seq + 1).returning(Shop.invoice_seq))).scalar_one_or_none()
    if seq is not None:
        order.invoice_number = f"INV/{financial_year(order.created_at or utcnow())}/{seq:04d}"


def _state_code(name: str) -> str | None:
    from app.services.billing import STATES
    key = re.sub(r"[^a-z]", "", (name or "").lower())
    return next((code for code, label in STATES.items() if re.sub(r"[^a-z]", "", label.lower()) == key), None) if key else None


def invoice(shop: Shop, order: ShopOrder) -> dict:
    """Invoice figures. Prices are GST-inclusive, so tax is carved out of each line; intra-state → CGST+SGST, inter-state → IGST.
    Without a GSTIN (or at 0%) it's a plain bill of supply."""
    from app.services.billing import STATES
    rate = shop.gst_rate if shop.gstin else 0
    seller_state = shop.gstin[:2] if shop.gstin else None
    buyer_state = _state_code((order.address or {}).get("state", "")) or seller_state  # unknown → treat as local (most sales are)
    intra = buyer_state == seller_state

    def split(amount: int) -> dict:
        taxable = round(amount * 100 / (100 + rate)) if rate else amount
        tax = amount - taxable
        return {"taxable": taxable, "cgst": tax // 2 if intra else 0, "sgst": tax - tax // 2 if intra else 0, "igst": 0 if intra else tax, "total": amount}

    lines = [{"name": item_label(i), "qty": i["qty"], "rate": i["price"], **split(i["price"] * i["qty"])} for i in order.items or []]
    if order.shipping:
        lines.append({"name": "Delivery charges", "qty": 1, "rate": order.shipping, **split(order.shipping)})
    totals = {k: sum(line[k] for line in lines) for k in ("taxable", "cgst", "sgst", "igst", "total")}
    return {
        "kind": "tax_invoice" if rate else "bill_of_supply", "number": order.invoice_number or f"ORDER-{order.number}", "order_number": order.number,
        "date": (order.paid_at or order.created_at or utcnow()).isoformat(), "gst_rate": rate, "intra_state": intra,
        "place_of_supply": STATES.get(buyer_state or "", (order.address or {}).get("state") or ""),
        "seller": {"name": shop.legal_name or shop.name, "store": shop.name, "gstin": shop.gstin, "address": shop.business_address, "phone": shop.support_phone,
                   "state": STATES.get(seller_state or "", "")},
        "buyer": {"name": order.customer_name, "phone": f"+{order.customer_phone}", "email": order.customer_email, "address": order.address or {}},
        "lines": lines, "totals": totals, "payment": {"method": order.payment_method, "status": order.payment_status},
    }
