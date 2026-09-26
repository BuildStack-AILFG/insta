"""
Inbound integration adapters. Each provider posts events to a secret hook URL; we verify the provider's signature, normalise the
payload to (phone, name, email, event, properties), then record the event and run the configured template action / flows.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable

import httpx

from app.core.crypto import CryptoError, decrypt_json

log = logging.getLogger(__name__)

ADAPTERS = ("shopify", "woocommerce", "razorpay", "stripe")
NOTIFY = ("slack",)
PROVIDER_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{1,46}$")

META: dict[str, dict] = {
    "shopify": {
        "mode": "events", "secret_label": "Webhook signing secret",
        "events": ["order_placed", "order_paid", "order_shipped", "order_cancelled", "checkout_abandoned"],
        "steps": ["In Shopify admin: Settings → Notifications → Webhooks → Create webhook.", "Pick a topic (Order creation, Order payment, Fulfillment creation, Order cancellation, Checkout update), format JSON.",
                  "Paste the hook URL below as the URL and copy Shopify's signing secret into the field.", "Use the events as flow triggers to tag customers, create deals or notify your team."],
    },
    "woocommerce": {
        "mode": "events", "secret_label": "Webhook secret",
        "events": ["order_placed", "order_processing", "order_completed", "order_cancelled"],
        "steps": ["In WordPress: WooCommerce → Settings → Advanced → Webhooks → Add webhook.", "Topic: Order created / Order updated. Delivery URL: the hook URL below.", "Set a Secret and paste the same value here."],
    },
    "razorpay": {
        "mode": "events", "secret_label": "Webhook secret", "events": ["payment_captured", "payment_failed", "order_paid"],
        "steps": ["Razorpay Dashboard → Settings → Webhooks → Add new webhook.", "URL: the hook URL below. Events: payment.captured, payment.failed, order.paid.", "Use the secret you set there in the field below."],
    },
    "stripe": {
        "mode": "events", "secret_label": "Signing secret (whsec_…)", "events": ["payment_succeeded", "payment_failed", "checkout_completed"],
        "steps": ["Stripe Dashboard → Developers → Webhooks → Add endpoint.", "Endpoint URL: the hook URL below. Events: payment_intent.succeeded, payment_intent.payment_failed, checkout.session.completed.",
                  "Copy the endpoint's signing secret into the field below."],
    },
    "slack": {
        "mode": "notify", "secret_label": "Slack incoming webhook URL", "events": ["conversation_created", "comment_automation_triggered", "lead_captured", "contact_opted_out", "message_failed", "deal_won", "payment_received"],
        "steps": ["In Slack: create an app → Incoming Webhooks → Add New Webhook to Workspace.", "Paste the webhook URL (https://hooks.slack.com/services/…) below and choose which events to post."],
    },
    "generic": {
        "mode": "generic", "secret_label": "Signing secret (optional)", "events": [],
        "steps": ["Add a webhook / HTTP action in your tool (Zapier, Make, n8n, Pabbly, Google Sheets script, your backend…).", "POST JSON to the hook URL below.",
                  'Body: {"phone": "919876543210", "name": "Priya", "email": "…", "event": "order_placed", "properties": {"order_id": "1042"}, "tags": ["vip"], "traits": {"city": "Pune"}}',
                  "Optionally set a secret and sign requests with header X-LFG-Signature: sha256=<hex HMAC of the raw body>."],
    },
}


def kind_of(provider: str) -> str:
    return provider if provider in ADAPTERS or provider in NOTIFY else "generic"


@dataclass
class Normalized:
    phone: str
    event: str
    name: str | None = None
    email: str | None = None
    properties: dict[str, Any] = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)
    traits: dict[str, Any] = field(default_factory=dict)


class VerifyError(Exception):
    pass


def _cmp(a: str, b: str) -> bool:
    return hmac.compare_digest(a.encode(), b.encode())


def verify(kind: str, secret: str | None, raw: bytes, headers: dict[str, str]) -> None:
    """Raise VerifyError unless the request is authentic. Adapters fail closed when no secret is stored."""
    h = {k.lower(): v for k, v in headers.items()}
    if kind == "generic":
        if not secret:
            return  # the unguessable URL is the credential
        sig = h.get("x-lfg-signature", "")
        if not sig.startswith("sha256=") or not _cmp(sig[7:], hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()):
            raise VerifyError("Invalid X-LFG-Signature.")
        return
    if not secret:
        raise VerifyError("No signing secret is configured for this integration.")
    if kind == "shopify":
        expected = base64.b64encode(hmac.new(secret.encode(), raw, hashlib.sha256).digest()).decode()
        if not _cmp(h.get("x-shopify-hmac-sha256", ""), expected):
            raise VerifyError("Invalid Shopify signature.")
    elif kind == "woocommerce":
        expected = base64.b64encode(hmac.new(secret.encode(), raw, hashlib.sha256).digest()).decode()
        if not _cmp(h.get("x-wc-webhook-signature", ""), expected):
            raise VerifyError("Invalid WooCommerce signature.")
    elif kind == "razorpay":
        if not _cmp(h.get("x-razorpay-signature", ""), hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()):
            raise VerifyError("Invalid Razorpay signature.")
    elif kind == "stripe":
        parts = dict(p.split("=", 1) for p in h.get("stripe-signature", "").split(",") if "=" in p)
        ts, sig = parts.get("t", ""), parts.get("v1", "")
        if not ts.isdigit() or abs(time.time() - int(ts)) > 300:
            raise VerifyError("Stripe signature timestamp is missing or too old.")
        if not _cmp(sig, hmac.new(secret.encode(), ts.encode() + b"." + raw, hashlib.sha256).hexdigest()):
            raise VerifyError("Invalid Stripe signature.")


def _first(*vals: Any) -> str | None:
    for v in vals:
        if isinstance(v, str) and v.strip():
            return v.strip()
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return str(v)
    return None


def _full_name(first: Any, last: Any) -> str | None:
    return " ".join(x for x in (str(first or "").strip(), str(last or "").strip()) if x) or None


def parse_shopify(data: dict, headers: dict[str, str]) -> list[Normalized]:
    topic = {k.lower(): v for k, v in headers.items()}.get("x-shopify-topic", "")
    event = {"orders/create": "order_placed", "orders/paid": "order_paid", "orders/fulfilled": "order_shipped", "fulfillments/create": "order_shipped",
             "orders/cancelled": "order_cancelled", "checkouts/create": "checkout_abandoned", "checkouts/update": "checkout_abandoned"}.get(topic)
    if not event:
        return []
    cust, ship, bill = data.get("customer") or {}, data.get("shipping_address") or {}, data.get("billing_address") or {}
    phone = _first(data.get("phone"), cust.get("phone"), ship.get("phone"), bill.get("phone"))
    if not phone:
        return []
    items = data.get("line_items") or []
    props = {"order_number": _first(data.get("name"), data.get("order_number"), data.get("id")), "total": _first(data.get("total_price")), "currency": _first(data.get("currency")),
             "status_url": _first(data.get("order_status_url"), data.get("abandoned_checkout_url")), "first_item": _first((items[0] or {}).get("title") if items else None)}
    return [Normalized(phone=phone, event=event, name=_full_name(cust.get("first_name") or ship.get("first_name"), cust.get("last_name") or ship.get("last_name")),
                       email=_first(data.get("email"), cust.get("email")), properties={k: v for k, v in props.items() if v is not None})]


def parse_woocommerce(data: dict, headers: dict[str, str]) -> list[Normalized]:
    if not isinstance(data, dict) or "billing" not in data:
        return []  # WooCommerce's ping on creation is a bare {"webhook_id": ...}
    status = str(data.get("status", "")).lower()
    topic = {k.lower(): v for k, v in headers.items()}.get("x-wc-webhook-topic", "")
    event = "order_placed" if topic == "order.created" else {"processing": "order_processing", "completed": "order_completed", "cancelled": "order_cancelled"}.get(status)
    bill = data.get("billing") or {}
    phone = _first(bill.get("phone"))
    if not event or not phone:
        return []
    return [Normalized(phone=phone, event=event, name=_full_name(bill.get("first_name"), bill.get("last_name")), email=_first(bill.get("email")),
                       properties={k: v for k, v in {"order_number": _first(data.get("number"), data.get("id")), "total": _first(data.get("total")), "currency": _first(data.get("currency")),
                                                      "status": status}.items() if v})]


def parse_razorpay(data: dict, headers: dict[str, str]) -> list[Normalized]:
    event = {"payment.captured": "payment_captured", "payment.failed": "payment_failed", "order.paid": "order_paid"}.get(str(data.get("event")))
    entity = ((data.get("payload") or {}).get("payment") or {}).get("entity") or {}
    phone = _first(entity.get("contact"))
    if not event or not phone:
        return []
    amount = entity.get("amount")
    return [Normalized(phone=phone, event=event, email=_first(entity.get("email")),
                       properties={k: v for k, v in {"payment_id": entity.get("id"), "amount": (amount / 100 if isinstance(amount, (int, float)) else None), "currency": entity.get("currency"),
                                                      "method": entity.get("method"), "reason": entity.get("error_description")}.items() if v is not None})]


def parse_stripe(data: dict, headers: dict[str, str]) -> list[Normalized]:
    event = {"payment_intent.succeeded": "payment_succeeded", "payment_intent.payment_failed": "payment_failed", "checkout.session.completed": "checkout_completed"}.get(str(data.get("type")))
    obj = (data.get("data") or {}).get("object") or {}
    if not event:
        return []
    details = obj.get("customer_details") or {}
    charges = ((obj.get("charges") or {}).get("data") or [{}])
    billing = (charges[0] or {}).get("billing_details") or {}
    phone = _first(details.get("phone"), billing.get("phone"), (obj.get("shipping") or {}).get("phone"))
    if not phone:
        return []
    amount = obj.get("amount_total") or obj.get("amount")
    return [Normalized(phone=phone, event=event, name=_first(details.get("name"), billing.get("name")), email=_first(details.get("email"), billing.get("email"), obj.get("receipt_email")),
                       properties={k: v for k, v in {"amount": (amount / 100 if isinstance(amount, (int, float)) else None), "currency": obj.get("currency"), "id": obj.get("id")}.items() if v is not None})]


def parse_generic(data: dict, headers: dict[str, str]) -> list[Normalized]:
    items = data if isinstance(data, list) else [data]
    out = []
    for d in items[:100]:
        if not isinstance(d, dict):
            continue
        phone = _first(d.get("phone"), d.get("mobile"), d.get("whatsapp"))  # "whatsapp" kept as an alias for existing Zaps
        if not phone:
            continue
        out.append(Normalized(phone=phone, event=(_first(d.get("event")) or "webhook_received")[:100], name=_first(d.get("name")), email=_first(d.get("email")),
                              properties=d.get("properties") if isinstance(d.get("properties"), dict) else {}, tags=[str(t) for t in d.get("tags", []) if isinstance(t, (str, int))][:20],
                              traits=d.get("traits") if isinstance(d.get("traits"), dict) else {}))
    return out


PARSERS: dict[str, Callable[[dict, dict[str, str]], list[Normalized]]] = {
    "shopify": parse_shopify, "woocommerce": parse_woocommerce, "razorpay": parse_razorpay, "stripe": parse_stripe, "generic": parse_generic,
}


async def post_slack(credentials_enc: str, text: str) -> tuple[bool, str]:
    """Post a message to a workspace's Slack incoming webhook. Returns (ok, detail)."""
    try:
        url = decrypt_json(credentials_enc)["webhook_url"]
        async with httpx.AsyncClient(timeout=8) as http:
            resp = await http.post(url, json={"text": text})
        return resp.status_code == 200, f"HTTP {resp.status_code}"
    except (httpx.HTTPError, CryptoError, KeyError) as exc:
        return False, exc.__class__.__name__


SLACK_TEXT = {
    "conversation_created": lambda d: f"💬 New Instagram conversation with @{d.get('username') or 'someone'}",
    "comment_automation_triggered": lambda d: f"💬 @{d.get('username') or 'someone'} commented \"{(d.get('text') or '')[:80]}\" — '{d.get('automation', '')}' replied",
    "lead_captured": lambda d: f"🎯 New website lead: {d.get('name') or 'Unknown'} ({d.get('phone', '?')})",
    "contact_opted_out": lambda d: f"🚫 @{d.get('username') or 'A contact'} opted out of automated messages",
    "message_failed": lambda d: f"⚠️ An Instagram message failed to send ({d.get('error') or 'unknown error'})",
    "deal_won": lambda d: f"🏆 Deal won: {d.get('title', 'a deal')} ({(d.get('value') or 0) / 100:,.0f} {d.get('currency', '')})",
    "payment_received": lambda d: f"💰 Payment received: {(d.get('amount') or 0) / 100:,.2f} {d.get('currency', '')}",
}
