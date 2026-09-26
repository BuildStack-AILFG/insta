"""Thin async client for the Razorpay REST API plus signature helpers. No business logic lives here."""

from __future__ import annotations

import hashlib
import hmac
import logging
from collections.abc import Callable
from typing import Any

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)


class RazorpayError(Exception):
    def __init__(self, message: str, *, status: int = 0, code: str | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code

    @property
    def is_auth_error(self) -> bool:
        return self.status in (401, 403)


# Tests replace this to route traffic to httpx.MockTransport.
_http_factory: Callable[[], httpx.AsyncClient] | None = None


def _client() -> tuple[httpx.AsyncClient, bool]:
    """(client, should_close). Requests are infrequent, so a fresh client per call keeps this free of shared-state bugs."""
    if _http_factory is not None:
        return _http_factory(), False
    return httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)), True


async def _request(method: str, path: str, key_id: str, key_secret: str, *, json: dict | None = None, params: dict | None = None) -> dict[str, Any]:
    base = get_settings().razorpay_api_base.rstrip("/")
    client, close = _client()
    try:
        resp = await client.request(method, f"{base}{path}", json=json, params=params, auth=(key_id, key_secret))
    except httpx.HTTPError as exc:
        raise RazorpayError("Couldn't reach Razorpay. Please try again in a moment.") from exc
    finally:
        if close:
            await client.aclose()
    if resp.status_code >= 400:
        try:
            err = resp.json().get("error", {})
        except Exception:  # noqa: BLE001 — non-JSON error body
            err = {}
        raise RazorpayError(err.get("description") or f"Razorpay returned HTTP {resp.status_code}", status=resp.status_code, code=err.get("code"))
    return resp.json()


# ---- platform (our own subscription billing) --------------------------------------------------------------------

def platform_configured() -> bool:
    s = get_settings()
    return bool(s.razorpay_key_id and s.razorpay_key_secret)


def _platform() -> tuple[str, str]:
    s = get_settings()
    if not (s.razorpay_key_id and s.razorpay_key_secret):
        raise RazorpayError("Online payments aren't enabled yet. Please contact support to upgrade.", status=503)
    return s.razorpay_key_id, s.razorpay_key_secret


async def create_order(amount: int, currency: str, receipt: str, notes: dict[str, str] | None = None) -> dict:
    key_id, secret = _platform()
    return await _request("POST", "/v1/orders", key_id, secret, json={"amount": amount, "currency": currency, "receipt": receipt[:40], "notes": notes or {}})


async def fetch_payment(payment_id: str) -> dict:
    key_id, secret = _platform()
    return await _request("GET", f"/v1/payments/{payment_id}", key_id, secret)


async def capture_payment(payment_id: str, amount: int, currency: str) -> dict:
    key_id, secret = _platform()
    return await _request("POST", f"/v1/payments/{payment_id}/capture", key_id, secret, json={"amount": amount, "currency": currency})


def _hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_payment_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Checkout returns HMAC-SHA256(order_id|payment_id) keyed with the account's key secret."""
    secret = get_settings().razorpay_key_secret
    if not secret or not signature:
        return False
    return hmac.compare_digest(_hmac_hex(secret, f"{order_id}|{payment_id}".encode()), signature)


def verify_webhook_signature(raw: bytes, signature: str, secret: str) -> bool:
    if not secret or not signature:
        return False
    return hmac.compare_digest(_hmac_hex(secret, raw), signature)


# ---- per-workspace (a workspace's own Razorpay account, used for customer payment links) ------------------------------

async def create_payment_link(key_id: str, key_secret: str, *, amount: int, currency: str, description: str, reference_id: str,
                              customer: dict | None = None, expire_by: int | None = None, callback_url: str | None = None) -> dict:
    body: dict[str, Any] = {"amount": amount, "currency": currency, "description": description[:2000], "reference_id": reference_id,
                            "reminder_enable": True, "notify": {"sms": False, "email": False}}
    if customer:
        body["customer"] = {k: v for k, v in customer.items() if v}
    if expire_by:
        body["expire_by"] = expire_by
    if callback_url:
        body["callback_url"], body["callback_method"] = callback_url, "get"
    return await _request("POST", "/v1/payment_links", key_id, key_secret, json=body)


async def fetch_payment_link(key_id: str, key_secret: str, link_id: str) -> dict:
    return await _request("GET", f"/v1/payment_links/{link_id}", key_id, key_secret)


async def cancel_payment_link(key_id: str, key_secret: str, link_id: str) -> dict:
    return await _request("POST", f"/v1/payment_links/{link_id}/cancel", key_id, key_secret)


async def verify_credentials(key_id: str, key_secret: str) -> None:
    """Cheapest authenticated call: raises RazorpayError(401) for wrong keys."""
    await _request("GET", "/v1/payments", key_id, key_secret, params={"count": 1})
