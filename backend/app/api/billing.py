"""Billing: plans & checkout (Razorpay), GST invoices, and the payment links a workspace sends to its own customers."""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import Ctx, get_ctx, get_db, require_manager, require_writer
from app.core import ratelimit
from app.core.config import get_settings
from app.models.billing import Payment, PaymentLink
from app.models.contact import Contact
from app.models.plan import Plan
from app.models.tenant import Tenant
from app.services import billing as svc
from app.services import payment_links as links
from app.services import razorpay

log = logging.getLogger(__name__)
router = APIRouter(prefix="/billing", tags=["billing"])
payments = APIRouter(prefix="/payments", tags=["payments"])


def _err(exc: svc.BillingError | links.LinkError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail={"error": exc.message})


def _rp(exc: razorpay.RazorpayError) -> HTTPException:
    return HTTPException(status_code=503 if exc.status in (0, 503) or exc.status >= 500 else 502, detail={"error": exc.message})


class ProfileIn(BaseModel):
    legal_name: str = ""
    gstin: str = ""
    address: str = ""
    city: str = ""
    state_code: str = ""
    pincode: str = ""
    email: str = ""
    phone: str = ""


class PlanChoice(BaseModel):
    plan_id: str = Field(min_length=1, max_length=32)
    interval: str = "monthly"


class VerifyIn(BaseModel):
    razorpay_order_id: str = Field(max_length=64)
    razorpay_payment_id: str = Field(max_length=64)
    razorpay_signature: str = Field(max_length=200)


def payment_out(p: Payment) -> dict:
    return {"id": str(p.id), "plan_id": p.plan_id, "interval": p.interval, "months": p.months, "currency": p.currency, "base_amount": p.base_amount, "credit_amount": p.credit_amount,
            "gst_amount": p.gst_amount, "total_amount": p.total_amount, "status": p.status, "invoice_number": p.invoice_number, "method": p.method,
            "paid_at": p.paid_at.isoformat() if p.paid_at else None, "period_start": p.period_start.isoformat() if p.period_start else None,
            "period_end": p.period_end.isoformat() if p.period_end else None, "created_at": p.created_at.isoformat() if p.created_at else None}


async def _tenant(db: AsyncSession, ctx: Ctx) -> Tenant:
    tenant = await db.get(Tenant, ctx.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail={"error": "Workspace not found."})
    return tenant


_state = svc.plan_state


# ---- overview & profile --------------------------------------------------------------------------------------------

@router.get("")
async def overview(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    tenant = await _tenant(db, ctx)
    s = get_settings()
    plans = (await db.execute(select(Plan))).scalars().all()
    cards = []
    for p in sorted(plans, key=lambda p: (p.price_monthly is None, p.price_monthly or 0)):
        card = {"id": p.id, "name": p.name, "quotas": p.quotas or {}, "purchasable": svc.is_purchasable(p), "current": p.id == tenant.plan_id,
                "per_month": {i: svc.per_month_price(p, i) for i in svc.INTERVALS}, "quotes": {}}
        if card["purchasable"]:
            for interval in svc.INTERVALS:
                try:
                    card["quotes"][interval] = (await svc.quote(db, tenant, p.id, interval)).to_dict()
                except svc.BillingError:
                    pass
        # retired/hidden plans (e.g. Scale) are listed only for the workspace that is still on one
        if p.id not in svc.UNPAID_PLANS and (p.is_public or p.id == tenant.plan_id):
            cards.append(card)
    recent = (await db.execute(select(Payment).where(Payment.tenant_id == tenant.id, Payment.status == "paid").order_by(Payment.paid_at.desc()).limit(50))).scalars().all()
    return {
        "enabled": razorpay.platform_configured(), "key_id": s.razorpay_key_id if razorpay.platform_configured() else None, "currency": s.billing_currency, "gst_percent": s.gst_percent,
        "plan": {"id": tenant.plan_id, **_state(tenant)}, "plans": cards, "profile": svc.get_profile(tenant), "states": svc.STATES,
        "seller": {"name": s.company_name, "gstin": s.company_gstin, "address": s.company_address, "email": s.company_email},
        "payments": [payment_out(p) for p in recent],
    }


@router.put("/profile")
async def put_profile(body: ProfileIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await svc.save_profile(db, await _tenant(db, ctx), body.model_dump())
    except svc.BillingError as exc:
        raise _err(exc)


# ---- checkout --------------------------------------------------------------------------------------------------------

@router.post("/quote")
async def quote(body: PlanChoice, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return (await svc.quote(db, await _tenant(db, ctx), body.plan_id, body.interval)).to_dict()
    except svc.BillingError as exc:
        raise _err(exc)


@router.post("/checkout")
async def checkout(body: PlanChoice, request: Request, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    """Create a Razorpay order for the chosen plan; the browser opens Razorpay Checkout with the returned values."""
    ratelimit.limit(request, "checkout", 20, 3600, str(ctx.tenant_id))
    tenant = await _tenant(db, ctx)
    profile = svc.get_profile(tenant)
    if not profile["legal_name"] or not profile["state_code"]:
        raise HTTPException(status_code=422, detail={"error": "Add your business name and state under Billing details first — they go on your GST invoice.", "code": "billing_profile"})
    try:
        payment, order = await svc.create_order(db, tenant, body.plan_id, body.interval)
    except svc.BillingError as exc:
        raise _err(exc)
    except razorpay.RazorpayError as exc:
        log.warning("razorpay order failed for tenant %s: %s", tenant.id, exc.message)
        raise _rp(exc)
    return {"payment_id": str(payment.id), "order_id": order["id"], "key_id": get_settings().razorpay_key_id, "amount": payment.total_amount, "currency": payment.currency,
            "name": get_settings().company_name, "description": f"{payment.plan_id.title()} plan · {payment.months} month{'s' if payment.months != 1 else ''}",
            "prefill": {"name": profile["legal_name"], "email": profile["email"], "contact": profile["phone"]}}


@router.post("/verify")
async def verify(body: VerifyIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    """Called by the browser after Checkout succeeds. The signature proves Razorpay (not the browser) says this order was paid."""
    payment = (await db.execute(select(Payment).where(Payment.razorpay_order_id == body.razorpay_order_id, Payment.tenant_id == ctx.tenant_id))).scalar_one_or_none()
    if payment is None:
        raise HTTPException(status_code=404, detail={"error": "We couldn't find that order."})
    if not razorpay.verify_payment_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature):
        raise HTTPException(status_code=400, detail={"error": "Payment verification failed. If money was deducted it will be refunded automatically — contact support with your payment id."})
    method = None
    try:
        remote = await razorpay.fetch_payment(body.razorpay_payment_id)
        method = remote.get("method")
        if remote.get("order_id") != payment.razorpay_order_id or remote.get("amount") != payment.total_amount:
            raise HTTPException(status_code=400, detail={"error": "Payment details don't match the order."})
        if remote.get("status") == "authorized":
            await razorpay.capture_payment(body.razorpay_payment_id, payment.total_amount, payment.currency)
    except razorpay.RazorpayError as exc:
        log.warning("could not double-check payment %s with Razorpay (%s); trusting the verified signature", body.razorpay_payment_id, exc.message)
    payment = await svc.activate(db, payment.id, body.razorpay_payment_id, method)
    return {"ok": True, "payment": payment_out(payment)}


@router.get("/payments")
async def list_payments(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(Payment).where(Payment.tenant_id == ctx.tenant_id, Payment.status == "paid").order_by(Payment.paid_at.desc()).limit(200))).scalars().all()
    return [payment_out(p) for p in rows]


@router.get("/invoices/{payment_id}")
async def get_invoice(payment_id: uuid.UUID, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    p = await db.get(Payment, payment_id)
    if p is None or p.tenant_id != ctx.tenant_id or p.status != "paid":
        raise HTTPException(status_code=404, detail={"error": "Invoice not found."})
    return svc.invoice(p)


@router.post("/webhook")
async def platform_webhook(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Razorpay -> us. Backstop for the browser callback (closed tab, lost connection): activates the plan when the order is paid."""
    secret = get_settings().razorpay_webhook_secret
    if not secret:
        raise HTTPException(status_code=503, detail={"error": "Webhook secret isn't configured."})
    raw = await request.body()
    if len(raw) > 256 * 1024:
        raise HTTPException(status_code=413, detail={"error": "Payload too large."})
    if not razorpay.verify_webhook_signature(raw, request.headers.get("x-razorpay-signature", ""), secret):
        raise HTTPException(status_code=401, detail={"error": "Invalid signature."})
    try:
        data = json.loads(raw)
    except ValueError:
        raise HTTPException(status_code=400, detail={"error": "Body must be JSON."})
    event = data.get("event")
    pay = ((data.get("payload") or {}).get("payment") or {}).get("entity") or {}
    order_id = pay.get("order_id") or (((data.get("payload") or {}).get("order") or {}).get("entity") or {}).get("id")
    if event in ("payment.captured", "order.paid") and order_id:
        payment = (await db.execute(select(Payment).where(Payment.razorpay_order_id == order_id))).scalar_one_or_none()
        if payment is not None and payment.status != "paid" and (not pay.get("amount") or pay["amount"] == payment.total_amount) and pay.get("id"):
            await svc.activate(db, payment.id, pay["id"], pay.get("method"))
            return {"ok": True, "activated": True}
    return {"ok": True}


# ---- payment links (a workspace's own Razorpay account) -----------------------------------------------------------------

class KeysIn(BaseModel):
    key_id: str = Field(min_length=1, max_length=100)
    key_secret: str = Field(min_length=1, max_length=200)


class LinkIn(BaseModel):
    amount: int = Field(ge=100, le=10**10, description="Smallest currency unit (paise)")
    currency: str = "INR"
    description: str = Field(default="", max_length=500)
    contact_id: uuid.UUID | None = None
    deal_id: uuid.UUID | None = None
    expire_days: int = Field(default=7, ge=0, le=180)


@payments.get("/settings")
async def payments_settings(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    return await links.status(db, ctx.tenant_id)


@payments.put("/settings")
async def connect_payments(body: KeysIn, ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return await links.connect(db, ctx.tenant_id, body.key_id, body.key_secret)
    except links.LinkError as exc:
        raise _err(exc)


@payments.delete("/settings", status_code=204, response_model=None)
async def disconnect_payments(ctx: Ctx = Depends(require_manager), db: AsyncSession = Depends(get_db)) -> None:
    await links.disconnect(db, ctx.tenant_id)


@payments.get("/links")
async def list_links(contact_id: uuid.UUID | None = None, deal_id: uuid.UUID | None = None, limit: int = Query(default=50, ge=1, le=200),
                     ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    q = select(PaymentLink).where(PaymentLink.tenant_id == ctx.tenant_id)
    if contact_id:
        q = q.where(PaymentLink.contact_id == contact_id)
    if deal_id:
        q = q.where(PaymentLink.deal_id == deal_id)
    rows = (await db.execute(q.order_by(PaymentLink.created_at.desc()).limit(limit))).scalars().all()
    cids = {r.contact_id for r in rows if r.contact_id}
    names = {c.id: c for c in (await db.execute(select(Contact).where(Contact.id.in_(cids)))).scalars().all()} if cids else {}
    return [links.out(r, names.get(r.contact_id)) for r in rows]


@payments.post("/links", status_code=201)
async def create_link(body: LinkIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        link = await links.create(db, ctx.tenant_id, ctx.user_id, amount=body.amount, currency=body.currency, description=body.description, contact_id=body.contact_id,
                                  deal_id=body.deal_id, expire_days=body.expire_days)
    except links.LinkError as exc:
        raise _err(exc)
    contact = await db.get(Contact, link.contact_id) if link.contact_id else None
    return links.out(link, contact)


async def _link(db: AsyncSession, ctx: Ctx, link_id: uuid.UUID) -> PaymentLink:
    link = await db.get(PaymentLink, link_id)
    if link is None or link.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Payment link not found."})
    return link


@payments.post("/links/{link_id}/refresh")
async def refresh_link(link_id: uuid.UUID, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return links.out(await links.refresh(db, await _link(db, ctx, link_id)))
    except links.LinkError as exc:
        raise _err(exc)


@payments.post("/links/{link_id}/cancel")
async def cancel_link(link_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    try:
        return links.out(await links.cancel(db, await _link(db, ctx, link_id)))
    except links.LinkError as exc:
        raise _err(exc)
