"""
Payment links a workspace sends to its own customers, using the workspace's own Razorpay account (so money goes straight to them, not us).
Credentials are stored encrypted as an Integration row. Status is learned from the workspace's Razorpay webhook (payment_link.paid)
and, as a fallback that needs no webhook setup, from a periodic poll of links that are still open.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import CryptoError, decrypt_json, encrypt_json
from app.db import session as db_session
from app.models.billing import PaymentLink
from app.models.contact import Contact
from app.models.integration import Integration
from app.models.pipeline import Deal
from app.services import outbound_webhooks, razorpay
from app.services.automation import events
from app.services.pipeline import _activity

log = logging.getLogger(__name__)

PROVIDER = "razorpay-payments"  # Integration.provider that holds the workspace's own Razorpay API keys
POLL_MAX_AGE = timedelta(days=14)
POLL_EVERY = timedelta(minutes=2)  # per link


class LinkError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message, self.status = message, status


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _row(db: AsyncSession, tenant_id: uuid.UUID) -> Integration | None:
    return (await db.execute(select(Integration).where(Integration.tenant_id == tenant_id, Integration.provider == PROVIDER))).scalar_one_or_none()


async def get_keys(db: AsyncSession, tenant_id: uuid.UUID) -> tuple[str, str] | None:
    row = await _row(db, tenant_id)
    if row is None or not row.credentials_enc:
        return None
    try:
        d = decrypt_json(row.credentials_enc)
        return d["key_id"], d["key_secret"]
    except (CryptoError, KeyError):
        return None


async def status(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    row = await _row(db, tenant_id)
    keys = await get_keys(db, tenant_id)
    return {"connected": keys is not None, "key_id": keys[0] if keys else None, "test_mode": bool(keys and keys[0].startswith("rzp_test_")),
            "connected_at": row.created_at.isoformat() if row and keys else None}


async def connect(db: AsyncSession, tenant_id: uuid.UUID, key_id: str, key_secret: str) -> dict:
    key_id, key_secret = key_id.strip(), key_secret.strip()
    if not key_id.startswith("rzp_") or not key_secret:
        raise LinkError("Paste the Key ID (starts with rzp_live_ or rzp_test_) and Key Secret from your Razorpay dashboard.")
    try:
        await razorpay.verify_credentials(key_id, key_secret)
    except razorpay.RazorpayError as exc:
        if exc.is_auth_error:
            raise LinkError("Razorpay rejected those keys. Check that the Key ID and Secret belong together.")
        raise LinkError(exc.message, 502)
    row = await _row(db, tenant_id)
    if row is None:
        import secrets
        row = Integration(tenant_id=tenant_id, provider=PROVIDER, hook_token=secrets.token_urlsafe(24), config={})
        db.add(row)
    row.credentials_enc, row.status, row.last_error = encrypt_json({"key_id": key_id, "key_secret": key_secret}), "connected", None
    await db.commit()
    return await status(db, tenant_id)


async def disconnect(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    row = await _row(db, tenant_id)
    if row is not None:
        await db.delete(row)
        await db.commit()


def out(link: PaymentLink, contact: Contact | None = None) -> dict:
    return {"id": str(link.id), "short_url": link.short_url, "amount": link.amount, "currency": link.currency, "description": link.description, "status": link.status,
            "contact_id": str(link.contact_id) if link.contact_id else None, "contact_name": contact.name if contact else None, "deal_id": str(link.deal_id) if link.deal_id else None,
            "paid_at": link.paid_at.isoformat() if link.paid_at else None, "created_at": link.created_at.isoformat() if link.created_at else None}


async def create(db: AsyncSession, tenant_id: uuid.UUID, user_id: uuid.UUID | None, *, amount: int, currency: str, description: str, contact_id: uuid.UUID | None,
                 deal_id: uuid.UUID | None, expire_days: int = 7) -> PaymentLink:
    keys = await get_keys(db, tenant_id)
    if keys is None:
        raise LinkError("Connect your Razorpay account first (Settings → Payments).", 409)
    if amount < 100:
        raise LinkError("The minimum payment is ₹1.")
    contact = None
    if contact_id:
        contact = await db.get(Contact, contact_id)
        if contact is None or contact.tenant_id != tenant_id:
            raise LinkError("Contact not found.", 404)
    if deal_id:
        deal = await db.get(Deal, deal_id)
        if deal is None or deal.tenant_id != tenant_id:
            raise LinkError("Deal not found.", 404)
    reference = f"lfg_{uuid.uuid4().hex[:20]}"
    try:
        rp = await razorpay.create_payment_link(
            keys[0], keys[1], amount=amount, currency=currency.upper(), description=description or "Payment", reference_id=reference,
            customer={"name": contact.name if contact and not contact.name.startswith("+") else None, "contact": f"+{contact.phone}" if contact and contact.phone else None, "email": contact.email if contact else None},
            expire_by=int((utcnow() + timedelta(days=max(1, min(expire_days, 180)))).timestamp()) if expire_days else None)
    except razorpay.RazorpayError as exc:
        raise LinkError(f"Razorpay: {exc.message}", 502 if exc.status >= 500 or exc.status == 0 else 422)
    link = PaymentLink(tenant_id=tenant_id, contact_id=contact_id, deal_id=deal_id, created_by=user_id, razorpay_link_id=rp["id"], reference_id=reference, short_url=rp["short_url"],
                       amount=amount, currency=currency.upper(), description=description or None, status="created")
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return link


async def mark_paid(db: AsyncSession, link: PaymentLink) -> bool:
    """Idempotent. Returns True the first time a link flips to paid."""
    if link.status == "paid":
        return False
    link.status, link.paid_at = "paid", utcnow()
    if link.deal_id:
        deal = await db.get(Deal, link.deal_id)
        if deal is not None:
            await _activity(db, deal, "payment", None, amount=link.amount, currency=link.currency, link=link.short_url)
    await db.commit()
    props = {"amount": link.amount / 100, "currency": link.currency, "description": link.description or "", "link_id": str(link.id)}
    await outbound_webhooks.emit(link.tenant_id, "payment_received", {"payment_link_id": str(link.id), "amount": link.amount, "currency": link.currency,
                                                                      "contact_id": str(link.contact_id) if link.contact_id else None, "deal_id": str(link.deal_id) if link.deal_id else None})
    if link.contact_id:
        contact = await db.get(Contact, link.contact_id)
        if contact is not None:
            await events.process(db, link.tenant_id, contact, "payment_received", props, "razorpay-payments")
    return True


def _apply_remote(link: PaymentLink, remote: dict) -> str:
    return {"paid": "paid", "cancelled": "cancelled", "expired": "expired"}.get(remote.get("status", ""), link.status)


async def refresh(db: AsyncSession, link: PaymentLink) -> PaymentLink:
    keys = await get_keys(db, link.tenant_id)
    if keys is None:
        raise LinkError("Your Razorpay account isn't connected.", 409)
    try:
        remote = await razorpay.fetch_payment_link(keys[0], keys[1], link.razorpay_link_id)
    except razorpay.RazorpayError as exc:
        raise LinkError(f"Razorpay: {exc.message}", 502)
    new = _apply_remote(link, remote)
    if new == "paid":
        await mark_paid(db, link)
    elif new != link.status:
        link.status = new
        await db.commit()
    return link


async def cancel(db: AsyncSession, link: PaymentLink) -> PaymentLink:
    if link.status != "created":
        raise LinkError("Only unpaid links can be cancelled.", 409)
    keys = await get_keys(db, link.tenant_id)
    if keys is None:
        raise LinkError("Your Razorpay account isn't connected.", 409)
    try:
        await razorpay.cancel_payment_link(keys[0], keys[1], link.razorpay_link_id)
    except razorpay.RazorpayError as exc:
        raise LinkError(f"Razorpay: {exc.message}", 502)
    link.status = "cancelled"
    await db.commit()
    return link


async def poll_open_links(limit: int = 25) -> int:
    """Scheduler fallback: ask Razorpay about links that are still open (oldest-checked first). Returns how many turned paid."""
    paid = 0
    async with db_session.async_session_factory() as db:
        links = (await db.execute(select(PaymentLink).where(PaymentLink.status == "created", PaymentLink.created_at > utcnow() - POLL_MAX_AGE,
                                                                  PaymentLink.updated_at < utcnow() - POLL_EVERY).order_by(PaymentLink.updated_at).limit(limit))).scalars().all()
        for link in links:
            try:
                before = link.status
                await refresh(db, link)
                if link.status == "created":
                    link.updated_at = utcnow()  # rotate so one stuck link can't starve the rest
                    await db.commit()
                paid += link.status == "paid" and before != "paid"
            except LinkError as exc:
                log.warning("polling payment link %s failed: %s", link.id, exc.message)
                await db.rollback()
            except Exception:  # noqa: BLE001
                log.exception("polling payment link %s failed", link.id)
                await db.rollback()
    return paid


async def handle_webhook_event(db: AsyncSession, tenant_id: uuid.UUID, payload: dict) -> bool:
    """A workspace's Razorpay webhook (delivered to its integration hook URL): payment_link.paid -> mark our record paid."""
    if payload.get("event") != "payment_link.paid":
        return False
    entity = ((payload.get("payload") or {}).get("payment_link") or {}).get("entity") or {}
    link = (await db.execute(select(PaymentLink).where(PaymentLink.tenant_id == tenant_id, PaymentLink.razorpay_link_id == str(entity.get("id"))))).scalar_one_or_none()
    return link is not None and await mark_paid(db, link)
