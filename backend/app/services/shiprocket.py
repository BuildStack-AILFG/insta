"""
Shiprocket, for shipping Shop orders: push an order, get an AWB + courier, and receive tracking updates by webhook.

Each workspace connects its *own* Shiprocket account with an API user (Shiprocket → Settings → API → Configure, a separate email
from their login). Credentials, the cached auth token and the webhook key are stored encrypted on an Integration row.
Shiprocket rejects webhook URLs containing "shiprocket", "kartrocket", "sr" or "kr", so the hook lives at
/api/courier-updates/{hex token} (hex can't spell those).
"""

from __future__ import annotations

import hmac
import logging
import secrets
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import CryptoError, decrypt_json, encrypt_json
from app.models.integration import Integration

log = logging.getLogger(__name__)

PROVIDER = "shiprocket"
BASE = "https://apiv2.shiprocket.in/v1/external"
TOKEN_TTL = timedelta(days=8)  # Shiprocket tokens last 10 days
DEFAULT_PACKAGE = {"weight_kg": 0.5, "length_cm": 15, "breadth_cm": 12, "height_cm": 8}

# Tests route traffic to httpx.MockTransport.
_http_factory: Callable[[], httpx.AsyncClient] | None = None


class ShiprocketError(Exception):
    def __init__(self, message: str, status: int = 0):
        super().__init__(message)
        self.message, self.status = message, status


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _request(method: str, path: str, *, token: str | None = None, json: dict | None = None, params: dict | None = None) -> dict[str, Any]:
    client = _http_factory() if _http_factory else httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
    try:
        resp = await client.request(method, f"{BASE}{path}", json=json, params=params, headers={"Authorization": f"Bearer {token}"} if token else {})
    except httpx.HTTPError as exc:
        raise ShiprocketError("Couldn't reach Shiprocket. Please try again in a moment.") from exc
    finally:
        if _http_factory is None:
            await client.aclose()
    try:
        body = resp.json()
    except ValueError:
        body = {}
    if resp.status_code >= 400:
        errors = body.get("errors") if isinstance(body, dict) else None
        detail = "; ".join(f"{k}: {', '.join(v) if isinstance(v, list) else v}" for k, v in errors.items()) if isinstance(errors, dict) else ""
        raise ShiprocketError(detail or (body.get("message") if isinstance(body, dict) else None) or f"Shiprocket returned HTTP {resp.status_code}", resp.status_code)
    return body if isinstance(body, dict) else {"data": body}


# ---- connection --------------------------------------------------------------------------------------------------

async def _row(db: AsyncSession, tenant_id: uuid.UUID) -> Integration | None:
    return (await db.execute(select(Integration).where(Integration.tenant_id == tenant_id, Integration.provider == PROVIDER))).scalar_one_or_none()


def _creds(row: Integration | None) -> dict | None:
    if row is None or not row.credentials_enc:
        return None
    try:
        return decrypt_json(row.credentials_enc)
    except CryptoError:
        return None


def webhook_path(row: Integration) -> str:
    return f"/api/courier-updates/{row.hook_token}"


async def status(db: AsyncSession, tenant_id: uuid.UUID, base: str) -> dict:
    row = await _row(db, tenant_id)
    creds = _creds(row)
    if row is None or creds is None:
        return {"connected": False}
    cfg = row.config or {}
    return {"connected": True, "email": creds.get("email"), "pickup_location": cfg.get("pickup_location"), "pickup_locations": cfg.get("pickup_locations", []),
            "package": {**DEFAULT_PACKAGE, **(cfg.get("package") or {})}, "webhook_url": f"{base.rstrip('/')}{webhook_path(row)}",
            "webhook_key": creds.get("webhook_key"), "last_error": row.last_error, "last_event_at": row.last_event_at.isoformat() if row.last_event_at else None}


async def _login(email: str, password: str) -> str:
    try:
        body = await _request("POST", "/auth/login", json={"email": email, "password": password})
    except ShiprocketError as exc:
        if exc.status in (400, 401, 403, 422):
            raise ShiprocketError("Shiprocket rejected that email and password. Use the API user from Shiprocket → Settings → API (not your login).", 422)
        raise
    token = body.get("token")
    if not token:
        raise ShiprocketError("Shiprocket didn't return a token.", 502)
    return token


async def _pickup_locations(token: str) -> list[str]:
    body = await _request("GET", "/settings/company/pickup", token=token)
    rows = ((body.get("data") or {}).get("shipping_address") or []) if isinstance(body.get("data"), dict) else []
    return [r["pickup_location"] for r in rows if r.get("pickup_location")]


async def connect(db: AsyncSession, tenant_id: uuid.UUID, *, email: str, password: str, pickup_location: str | None, package: dict | None, base: str) -> dict:
    row = await _row(db, tenant_id)
    creds = _creds(row) or {}
    password = password or creds.get("password", "")
    if not email or not password:
        raise ShiprocketError("Enter the API user's email and password.", 422)
    token = await _login(email.strip(), password)
    locations = await _pickup_locations(token)
    if not locations:
        raise ShiprocketError("Add a pickup address in Shiprocket first (Settings → Pickup Addresses).", 422)
    if row is None:
        row = Integration(tenant_id=tenant_id, provider=PROVIDER, hook_token=secrets.token_hex(20), config={})
        db.add(row)
    row.credentials_enc = encrypt_json({"email": email.strip(), "password": password, "token": token, "token_at": utcnow().isoformat(),
                                        "webhook_key": creds.get("webhook_key") or secrets.token_hex(16)})
    row.config = {"pickup_location": pickup_location if pickup_location in locations else locations[0], "pickup_locations": locations,
                  "package": {**DEFAULT_PACKAGE, **(package or {})}}
    row.status, row.last_error = "connected", None
    await db.commit()
    return await status(db, tenant_id, base)


async def disconnect(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    row = await _row(db, tenant_id)
    if row is not None:
        await db.delete(row)
        await db.commit()


async def _token(db: AsyncSession, row: Integration, *, fresh: bool = False) -> str:
    creds = _creds(row)
    if creds is None:
        raise ShiprocketError("Reconnect Shiprocket — its saved login can't be read.", 409)
    try:
        age = utcnow() - datetime.fromisoformat(creds.get("token_at", ""))
    except ValueError:
        age = TOKEN_TTL
    if fresh or not creds.get("token") or age >= TOKEN_TTL:
        creds["token"], creds["token_at"] = await _login(creds["email"], creds["password"]), utcnow().isoformat()
        row.credentials_enc = encrypt_json(creds)
        await db.flush()
    return creds["token"]


async def _call(db: AsyncSession, row: Integration, method: str, path: str, **kw) -> dict:
    """An authenticated call; logs in again once if the cached token was revoked."""
    try:
        return await _request(method, path, token=await _token(db, row), **kw)
    except ShiprocketError as exc:
        if exc.status != 401:
            raise
        return await _request(method, path, token=await _token(db, row, fresh=True), **kw)


# ---- shipping an order -------------------------------------------------------------------------------------------

async def ship(db: AsyncSession, tenant_id: uuid.UUID, body: dict, package: dict | None = None, shipment_id: str | None = None) -> dict:
    """Create the Shiprocket order (unless `shipment_id` exists from an earlier try) and assign an AWB.
    Returns {order_id, shipment_id, awb, courier}; `awb` is None if Shiprocket couldn't assign one (the order still exists there)."""
    row = await _row(db, tenant_id)
    if row is None or _creds(row) is None:
        raise ShiprocketError("Connect Shiprocket first (Shop → Store settings → Shipping).", 409)
    cfg = row.config or {}
    pkg = {**DEFAULT_PACKAGE, **(cfg.get("package") or {}), **(package or {})}
    order_id = None
    if not shipment_id:
        created = await _call(db, row, "POST", "/orders/create/adhoc", json={
            **body, "pickup_location": cfg.get("pickup_location") or "Primary",
            "length": pkg["length_cm"], "breadth": pkg["breadth_cm"], "height": pkg["height_cm"], "weight": pkg["weight_kg"]})
        shipment_id, order_id = str(created.get("shipment_id") or ""), str(created.get("order_id") or "")
        if not shipment_id:
            raise ShiprocketError(created.get("message") or "Shiprocket didn't create a shipment.", 502)
    awb = courier = None
    try:
        assigned = await _call(db, row, "POST", "/courier/assign/awb", json={"shipment_id": shipment_id})
        data = ((assigned.get("response") or {}).get("data") or {}) if assigned.get("awb_assign_status") == 1 else {}
        awb, courier = data.get("awb_code") or None, data.get("courier_name") or None
        if not awb:
            row.last_error = str(assigned.get("message") or (assigned.get("response") or {}).get("data") or "No courier assigned")[:500]
    except ShiprocketError as exc:
        row.last_error = exc.message[:500]
    await db.commit()
    return {"order_id": order_id, "shipment_id": shipment_id, "awb": awb, "courier": courier}


def tracking_url(awb: str) -> str:
    return f"https://shiprocket.co/tracking/{awb}"


# ---- tracking webhook ----------------------------------------------------------------------------------------------

async def hook_row(db: AsyncSession, token: str) -> Integration | None:
    return (await db.execute(select(Integration).where(Integration.hook_token == token, Integration.provider == PROVIDER))).scalar_one_or_none()


def verify(row: Integration, api_key: str | None) -> bool:
    creds = _creds(row) or {}
    return bool(api_key and creds.get("webhook_key")) and hmac.compare_digest(api_key, creds["webhook_key"])
