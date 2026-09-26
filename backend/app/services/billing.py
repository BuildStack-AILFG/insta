"""
Subscription billing. Plans are prepaid for 1, 3 or 12 months through Razorpay Orders; GST is added on top and every paid order gets a
GST invoice number. Switching plans mid-period credits the unused value of the current plan against the new one. A paid plan that
lapses (after a short grace period) drops to Free, and an unpaid trial drops to Free when it ends.

All amounts are integers in the smallest currency unit (paise).
"""

from __future__ import annotations

import html
import logging
import math
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import get_settings
from app.db import session as db_session
from app.models.billing import Payment
from app.models.plan import Plan
from app.models.tenant import Tenant, TenantMembership, User
from app.services import mailer

log = logging.getLogger(__name__)

INTERVALS = {"monthly": 1, "quarterly": 3, "yearly": 12}
MIN_CHARGE = 100  # paise; Razorpay rejects orders below ₹1
GRACE = timedelta(days=2)
REMIND_BEFORE = timedelta(days=7)
UNPAID_PLANS = {"free", "trial"}
IST = ZoneInfo("Asia/Kolkata")
INVOICE_LOCK = 7_262_026_002
GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")

# GST state / UT codes (the first two digits of a GSTIN).
STATES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
    "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh",
    "23": "Madhya Pradesh", "24": "Gujarat", "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra", "29": "Karnataka", "30": "Goa",
    "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands", "36": "Telangana",
    "37": "Andhra Pradesh", "38": "Ladakh",
}


class BillingError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message, self.status = message, status


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def add_months(dt: datetime, months: int) -> datetime:
    month0 = dt.month - 1 + months
    year, month = dt.year + month0 // 12, month0 % 12 + 1
    last_day = (datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=dt.tzinfo) - timedelta(days=1)).day
    return dt.replace(year=year, month=month, day=min(dt.day, last_day))


def gst_of(taxable: int) -> int:
    return round(taxable * get_settings().gst_percent / 100)


def financial_year(dt: datetime) -> str:
    d = dt.astimezone(IST)
    start = d.year if d.month >= 4 else d.year - 1
    return f"{start}-{str(start + 1)[2:]}"


# ---- billing profile (who the invoice is addressed to) -----------------------------------------------------------

PROFILE_FIELDS = ("legal_name", "gstin", "address", "city", "state_code", "pincode", "email", "phone")


def get_profile(tenant: Tenant) -> dict:
    p = (tenant.settings or {}).get("billing", {}).get("profile", {}) or {}
    return {k: str(p.get(k) or "") for k in PROFILE_FIELDS}


def clean_profile(data: dict) -> dict:
    out = {k: str(data.get(k) or "").strip() for k in PROFILE_FIELDS}
    out["gstin"] = out["gstin"].upper()
    if out["gstin"]:
        if not GSTIN_RE.match(out["gstin"]):
            raise BillingError("That GSTIN doesn't look right. It should be 15 characters, like 27ABCDE1234F1Z5.")
        out["state_code"] = out["gstin"][:2]  # the GSTIN is authoritative for the place of supply
    if out["state_code"] and out["state_code"] not in STATES:
        raise BillingError("Choose a valid state.")
    if out["email"] and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", out["email"]):
        raise BillingError("Enter a valid billing email.")
    if out["pincode"] and not re.match(r"^\d{6}$", out["pincode"]):
        raise BillingError("PIN code must be 6 digits.")
    for k, n in (("legal_name", 200), ("address", 400), ("city", 100), ("phone", 30), ("email", 200)):
        if len(out[k]) > n:
            raise BillingError(f"'{k.replace('_', ' ')}' is too long.")
    return out


async def save_profile(db: AsyncSession, tenant: Tenant, data: dict) -> dict:
    profile = clean_profile(data)
    settings = dict(tenant.settings or {})
    billing = dict(settings.get("billing", {}))
    billing["profile"] = profile
    settings["billing"] = billing
    tenant.settings = settings
    flag_modified(tenant, "settings")
    await db.commit()
    return profile


# ---- quoting --------------------------------------------------------------------------------------------------

@dataclass
class Quote:
    plan_id: str
    plan_name: str
    interval: str
    months: int
    currency: str
    per_month: int
    base: int
    credit: int
    taxable: int
    gst: int
    total: int
    starts_at: datetime
    ends_at: datetime
    renewal: bool

    def to_dict(self) -> dict:
        return {"plan_id": self.plan_id, "plan_name": self.plan_name, "interval": self.interval, "months": self.months, "currency": self.currency,
                "per_month": self.per_month, "base": self.base, "credit": self.credit, "taxable": self.taxable, "gst": self.gst, "gst_percent": get_settings().gst_percent,
                "total": self.total, "starts_at": self.starts_at.isoformat(), "ends_at": self.ends_at.isoformat(), "renewal": self.renewal}


def per_month_price(plan: Plan, interval: str) -> int | None:
    return {"monthly": plan.price_monthly, "quarterly": plan.price_quarterly, "yearly": plan.price_yearly}.get(interval)


def is_purchasable(plan: Plan) -> bool:
    return plan.id not in UNPAID_PLANS and plan.price_monthly is not None


def plan_state(tenant: Tenant) -> dict:
    """Where a workspace stands: trial | free | active | grace | custom, when it ends and how many days are left."""
    now = utcnow()
    if tenant.plan_id == "trial":
        end, kind = tenant.trial_ends_at, "trial"
    elif tenant.plan_id == "free":
        end, kind = None, "free"
    elif tenant.plan_expires_at is None:
        end, kind = None, "custom"  # e.g. Enterprise set up by hand
    else:
        end, kind = tenant.plan_expires_at, "active" if active_paid(tenant, now) else "grace"
    days_left = max(math.ceil((end - now).total_seconds() / 86400), 0) if end and end > now else 0
    return {"kind": kind, "ends_at": end.isoformat() if end else None, "days_left": days_left, "expired": bool(end and end <= now and kind != "custom")}


def active_paid(tenant: Tenant, now: datetime | None = None) -> bool:
    now = now or utcnow()
    return tenant.plan_id not in UNPAID_PLANS and bool(tenant.plan_expires_at) and tenant.plan_expires_at > now


async def _unused_value(db: AsyncSession, tenant: Tenant, now: datetime) -> int:
    """Value (ex-tax) of the time already paid for on the current plan and not yet used."""
    rows = (await db.execute(select(Payment).where(
        Payment.tenant_id == tenant.id, Payment.status == "paid", Payment.plan_id == tenant.plan_id, Payment.period_end > now,
    ))).scalars().all()
    total = 0.0
    for p in rows:
        if not p.period_start or not p.period_end:
            continue
        span = (p.period_end - p.period_start).total_seconds()
        left = (p.period_end - max(p.period_start, now)).total_seconds()
        if span > 0 and left > 0:
            total += max(p.base_amount - p.credit_amount, 0) * left / span
    return int(total)


async def quote(db: AsyncSession, tenant: Tenant, plan_id: str, interval: str) -> Quote:
    if interval not in INTERVALS:
        raise BillingError("Choose monthly, quarterly or yearly billing.")
    plan = await db.get(Plan, plan_id)
    if plan is None or not is_purchasable(plan):
        raise BillingError("That plan can't be purchased online. Contact sales for Enterprise pricing.")
    per_month = per_month_price(plan, interval)
    if not per_month:
        raise BillingError("That billing period isn't available for this plan.")
    months, now = INTERVALS[interval], utcnow()
    base = per_month * months
    renewal = tenant.plan_id == plan_id and active_paid(tenant, now)
    credit = 0
    if not renewal and active_paid(tenant, now):
        credit = min(await _unused_value(db, tenant, now), max(base - MIN_CHARGE, 0))
    taxable = base - credit
    gst = gst_of(taxable)
    start = tenant.plan_expires_at if renewal else now
    return Quote(plan.id, plan.name, interval, months, get_settings().billing_currency, per_month, base, credit, taxable, gst, taxable + gst, start, add_months(start, months), renewal)


# ---- orders & activation ---------------------------------------------------------------------------------------

async def create_order(db: AsyncSession, tenant: Tenant, plan_id: str, interval: str) -> tuple[Payment, dict]:
    from app.services import razorpay  # local import keeps the module import-light for the scheduler

    q = await quote(db, tenant, plan_id, interval)
    order = await razorpay.create_order(q.total, q.currency, receipt=f"sd_{uuid.uuid4().hex[:24]}",
                                        notes={"tenant_id": str(tenant.id), "plan": q.plan_id, "interval": q.interval})
    payment = Payment(tenant_id=tenant.id, plan_id=q.plan_id, interval=q.interval, months=q.months, currency=q.currency, base_amount=q.base, credit_amount=q.credit,
                      gst_amount=q.gst, total_amount=q.total, razorpay_order_id=order["id"], status="created", profile_snapshot=get_profile(tenant),
                      period_start=q.starts_at, period_end=q.ends_at)
    db.add(payment)
    await db.commit()
    await db.refresh(payment)
    return payment, order


async def _next_invoice(db: AsyncSession, when: datetime) -> tuple[str, int]:
    fy = financial_year(when)
    await db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": INVOICE_LOCK})
    seq = (await db.execute(select(func.coalesce(func.max(Payment.invoice_seq), 0)).where(Payment.invoice_number.like(f"SD/{fy}/%")))).scalar_one() + 1
    return f"SD/{fy}/{seq:05d}", seq


async def activate(db: AsyncSession, payment_id: uuid.UUID, razorpay_payment_id: str, method: str | None = None) -> Payment:
    """Mark a payment paid and switch the workspace to the purchased plan. Idempotent: safe for the browser callback and the webhook to both call."""
    payment = (await db.execute(select(Payment).where(Payment.id == payment_id).with_for_update())).scalar_one()
    if payment.status == "paid":
        return payment
    tenant = (await db.execute(select(Tenant).where(Tenant.id == payment.tenant_id).with_for_update())).scalar_one()
    now = utcnow()
    renewal = tenant.plan_id == payment.plan_id and active_paid(tenant, now)
    start = tenant.plan_expires_at if renewal else now
    end = add_months(start, payment.months)

    payment.status, payment.razorpay_payment_id, payment.method, payment.paid_at = "paid", razorpay_payment_id, method, now
    payment.period_start, payment.period_end = start, end
    payment.invoice_number, payment.invoice_seq = await _next_invoice(db, now)

    tenant.plan_id, tenant.plan_expires_at = payment.plan_id, end
    settings = dict(tenant.settings or {})
    billing = dict(settings.get("billing", {}))
    billing.pop("reminded_for", None)
    settings["billing"] = billing
    tenant.settings = settings
    flag_modified(tenant, "settings")
    await db.commit()
    log.info("payment %s paid: tenant=%s plan=%s until %s invoice=%s", razorpay_payment_id, tenant.id, payment.plan_id, end.date(), payment.invoice_number)
    await _email_receipt(db, tenant, payment)
    return payment


async def _owner_emails(db: AsyncSession, tenant_id: uuid.UUID) -> list[str]:
    rows = (await db.execute(select(User.email).join(TenantMembership, TenantMembership.user_id == User.id).where(
        TenantMembership.tenant_id == tenant_id, TenantMembership.role.in_(("owner", "admin")), User.is_active.is_(True)))).scalars().all()
    return list(rows)


def money(paise: int, currency: str = "INR") -> str:
    sym = {"INR": "₹", "USD": "$"}.get(currency, currency + " ")
    return f"{sym}{paise / 100:,.2f}"


async def _email_receipt(db: AsyncSession, tenant: Tenant, payment: Payment) -> None:
    if not mailer.enabled():
        return
    s = get_settings()
    plan = await db.get(Plan, payment.plan_id)
    body = (f"Thanks for your payment of {money(payment.total_amount, payment.currency)}. Your workspace <b>{html.escape(tenant.name)}</b> is on the "
            f"<b>{html.escape(plan.name if plan else payment.plan_id)}</b> plan until {payment.period_end:%d %b %Y}. Invoice {html.escape(payment.invoice_number or '')} is available in Settings → Billing.")
    page = mailer.button_html("Payment received", body, "View invoice", f"{s.frontend_url}/dashboard/settings?tab=billing")
    recipients = set(await _owner_emails(db, tenant.id))
    if (payment.profile_snapshot or {}).get("email"):
        recipients.add(payment.profile_snapshot["email"])
    for to in recipients:
        await mailer.send(to, f"Payment received — invoice {payment.invoice_number}", page)


# ---- invoices ---------------------------------------------------------------------------------------------------

def invoice(payment: Payment) -> dict:
    """Everything the UI needs to render a GST invoice, with CGST+SGST vs IGST decided by seller/buyer state."""
    s = get_settings()
    buyer = payment.profile_snapshot or {}
    seller_state = s.company_gstin[:2] if len(s.company_gstin) >= 2 else ""
    buyer_state = (buyer.get("gstin") or "")[:2] or buyer.get("state_code", "")
    taxable = payment.base_amount - payment.credit_amount
    intra = bool(seller_state and buyer_state and seller_state == buyer_state)
    tax = {"cgst": payment.gst_amount // 2, "sgst": payment.gst_amount - payment.gst_amount // 2, "igst": 0} if intra else {"cgst": 0, "sgst": 0, "igst": payment.gst_amount}
    return {
        "number": payment.invoice_number, "date": (payment.paid_at or payment.created_at).isoformat(), "status": payment.status, "currency": payment.currency,
        "seller": {"name": s.company_name, "gstin": s.company_gstin, "address": s.company_address, "email": s.company_email, "state": STATES.get(seller_state, "")},
        "buyer": {**buyer, "state": STATES.get(buyer_state, "")},
        "place_of_supply": STATES.get(buyer_state, ""),
        "line": {"description": f"{(payment.plan_id).title()} plan — {payment.months} month{'s' if payment.months != 1 else ''}", "sac": "998431",
                 "period_start": payment.period_start.isoformat() if payment.period_start else None, "period_end": payment.period_end.isoformat() if payment.period_end else None},
        "amounts": {"base": payment.base_amount, "credit": payment.credit_amount, "taxable": taxable, "gst_percent": s.gst_percent, **tax, "gst": payment.gst_amount, "total": payment.total_amount},
        "razorpay_payment_id": payment.razorpay_payment_id, "method": payment.method,
    }


# ---- housekeeping (scheduler) -----------------------------------------------------------------------------------

async def housekeeping() -> dict[str, int]:
    """Downgrade lapsed trials/plans to Free and remind owners a week before a plan ends. Idempotent."""
    out = {"trial_ended": 0, "plan_lapsed": 0, "reminders": 0}
    now = utcnow()
    async with db_session.async_session_factory() as db:
        res = await db.execute(update(Tenant).where(Tenant.plan_id == "trial", Tenant.trial_ends_at.is_not(None), Tenant.trial_ends_at < now, Tenant.status == "active").values(plan_id="free"))
        out["trial_ended"] = res.rowcount or 0
        res = await db.execute(update(Tenant).where(Tenant.plan_id.not_in(("free", "trial", "enterprise")), Tenant.plan_expires_at.is_not(None), Tenant.plan_expires_at < now - GRACE).values(plan_id="free"))
        out["plan_lapsed"] = res.rowcount or 0
        await db.commit()

        due = (await db.execute(select(Tenant).where(Tenant.plan_id.not_in(("free", "trial", "enterprise")), Tenant.plan_expires_at.is_not(None),
                                                     Tenant.plan_expires_at < now + REMIND_BEFORE, Tenant.status == "active"))).scalars().all()
        for tenant in due:
            marker = tenant.plan_expires_at.isoformat()
            if (tenant.settings or {}).get("billing", {}).get("reminded_for") == marker:
                continue
            settings = dict(tenant.settings or {})
            settings["billing"] = {**settings.get("billing", {}), "reminded_for": marker}
            tenant.settings = settings
            flag_modified(tenant, "settings")
            await db.commit()  # mark first: a failed email must not be retried every tick
            if mailer.enabled():
                expired = tenant.plan_expires_at <= now
                subject = "Your LeadForGrow plan has ended" if expired else "Your LeadForGrow plan ends soon"
                body = (f"Your <b>{html.escape(tenant.name)}</b> plan {'ended' if expired else 'ends'} on {tenant.plan_expires_at:%d %b %Y}. "
                        "Renew to keep your team, automations and campaigns running without interruption.")
                page = mailer.button_html(subject, body, "Renew now", f"{get_settings().frontend_url}/dashboard/settings?tab=billing")
                for to in await _owner_emails(db, tenant.id):
                    await mailer.send(to, subject, page)
            out["reminders"] += 1
    return out
