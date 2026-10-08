"""
Custom domains for shop websites (e.g. shop.priyaboutique.com instead of gramforgrow.in/s/priyas-boutique).

The seller adds a DNS record pointing at the web app's host — a CNAME for a subdomain, an A record for a root domain — and we check that
the domain resolves to the same place before turning it on. The frontend's proxy (src/proxy.ts) then serves the store for that host.
When a Vercel token and project are configured, the domain is also added to the Vercel project so HTTPS certificates are issued.
"""

from __future__ import annotations

import asyncio
import logging
import re
import socket
from collections.abc import Callable
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.shop import Shop

log = logging.getLogger(__name__)

_LABEL = re.compile(r"^(?!-)[a-z0-9-]{1,63}(?<!-)$")
OWN = ("gramforgrow.in", "vercel.app", "localhost")

# Tests route Vercel calls to httpx.MockTransport (and replace `resolve` below).
_http_factory: Callable[[], httpx.AsyncClient] | None = None


class DomainError(Exception):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.message, self.status = message, status


def _resolve(host: str) -> set[str]:
    try:
        return {info[4][0] for info in socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)}
    except OSError:
        return set()


resolve = _resolve


def normalize(raw: str) -> str:
    """'https://Shop.Example.com/x' -> 'shop.example.com'. Raises DomainError for anything that isn't a public hostname we can serve."""
    d = re.sub(r"^[a-z]+://", "", (raw or "").strip().lower()).split("/")[0].split(":")[0].rstrip(".")
    labels = d.split(".")
    if len(d) > 253 or len(labels) < 2 or not all(_LABEL.match(x) for x in labels) or labels[-1].isdigit():
        raise DomainError("Enter a domain like shop.yourbrand.com")
    if any(d == own or d.endswith(f".{own}") for own in OWN):
        raise DomainError("Use a domain you own — not a GramForGrow or Vercel address.")
    return d


def _registrable(domain: str) -> str:
    """The part the seller bought: example.com, or example.co.in for second-level country domains."""
    labels = domain.split(".")
    n = 3 if len(labels) >= 3 and labels[-2] in {"co", "net", "org", "gov", "ac", "edu", "firm", "gen", "ind"} and len(labels[-1]) == 2 else 2
    return ".".join(labels[-n:])


def is_root(domain: str) -> bool:
    """example.com / example.co.in need an A record (CNAMEs aren't allowed at the root); subdomains use a CNAME."""
    return domain == _registrable(domain)


def instructions(domain: str) -> dict:
    """The DNS record to add at the seller's domain provider."""
    s = get_settings()
    if is_root(domain):
        return {"type": "A", "name": "@", "value": s.store_domain_ips[0] if s.store_domain_ips else ""}
    return {"type": "CNAME", "name": domain[: -len(_registrable(domain)) - 1], "value": s.store_domain_cname}


def _targets() -> set[str]:
    s = get_settings()
    return set(s.store_domain_ips) | (resolve(s.store_domain_cname) if s.store_domain_cname else set())


async def points_here(domain: str) -> bool:
    got = await asyncio.to_thread(resolve, domain)
    want = await asyncio.to_thread(_targets)
    return bool(got and want and got & want)


async def _register_with_vercel(domain: str) -> str | None:
    """Add the domain to the Vercel project (idempotent). Returns an error message, or None when done / not configured."""
    s = get_settings()
    if not (s.vercel_api_token and s.vercel_project_id):
        return None
    client = _http_factory() if _http_factory else httpx.AsyncClient(timeout=20)
    try:
        resp = await client.post(f"https://api.vercel.com/v10/projects/{s.vercel_project_id}/domains", params={"teamId": s.vercel_team_id} if s.vercel_team_id else None,
                                 headers={"Authorization": f"Bearer {s.vercel_api_token}"}, json={"name": domain})
    except httpx.HTTPError as exc:
        return f"Couldn't reach Vercel: {exc}"
    finally:
        if _http_factory is None:
            await client.aclose()
    if resp.status_code < 300 or (resp.status_code == 409 and "already" in resp.text.lower() and "this project" in resp.text.lower()):
        return None
    log.warning("vercel refused domain %s: %s %s", domain, resp.status_code, resp.text[:300])
    try:
        return (resp.json().get("error") or {}).get("message") or f"Vercel returned HTTP {resp.status_code}"
    except ValueError:
        return f"Vercel returned HTTP {resp.status_code}"


async def set_domain(db: AsyncSession, shop: Shop, raw: str | None) -> None:
    if not raw or not raw.strip():
        shop.custom_domain, shop.domain_status, shop.domain_checked_at = None, "none", None
        await db.commit()
        return
    domain = normalize(raw)
    taken = (await db.execute(select(Shop.id).where(Shop.custom_domain == domain, Shop.id != shop.id))).first()
    if taken:
        raise DomainError("That domain is already connected to another store.", 409)
    if domain != shop.custom_domain:
        shop.custom_domain, shop.domain_status, shop.domain_checked_at = domain, "pending", None
    await db.commit()


async def check(db: AsyncSession, shop: Shop) -> str | None:
    """Re-check the DNS. Returns a message for the seller when it isn't ready yet."""
    if not shop.custom_domain:
        raise DomainError("Add a domain first.", 409)
    shop.domain_checked_at = datetime.now(timezone.utc)
    message = None
    if not await points_here(shop.custom_domain):
        r = instructions(shop.custom_domain)
        shop.domain_status = "pending"
        message = f"{shop.custom_domain} doesn't point to us yet. Add the {r['type']} record and check again — DNS changes can take up to a few hours."
    else:
        error = await _register_with_vercel(shop.custom_domain)
        shop.domain_status = "pending" if error else "active"
        message = f"The DNS is right, but the domain couldn't be activated: {error}" if error else None
    await db.commit()
    return message


async def shop_for_host(db: AsyncSession, host: str) -> Shop | None:
    host = host.lower().split(":")[0]
    return (await db.execute(select(Shop).where(Shop.custom_domain.in_({host, host.removeprefix("www.")}), Shop.domain_status == "active",
                                                Shop.published.is_(True)))).scalar_one_or_none()
