"""In-memory sliding-window rate limiter. Per-process: correct for a single instance (see lib/PHASES.md), swap for Redis when scaling out."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

from app.core.config import get_settings

_hits: dict[str, deque[float]] = defaultdict(deque)
_MAX_KEYS = 50_000


def allow(key: str, limit: int, window_seconds: int) -> bool:
    now = time.monotonic()
    q = _hits[key]
    while q and now - q[0] > window_seconds:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    if len(_hits) > _MAX_KEYS:  # bound memory under a key-spraying attack
        for k in [k for k, v in _hits.items() if not v or now - v[-1] > window_seconds][:10_000]:
            _hits.pop(k, None)
    return True


def client_ip(request: Request) -> str:
    """The caller's IP. Only the entries our own proxies appended to X-Forwarded-For are trusted: anything further left was sent by the client."""
    peer = request.client.host if request.client else "unknown"
    hops = get_settings().trusted_proxy_hops
    fwd = [p.strip() for p in (request.headers.get("x-forwarded-for") or "").split(",") if p.strip()]
    if hops <= 0 or not fwd:
        return peer
    return fwd[-hops] if len(fwd) >= hops else fwd[0]


def limit(request: Request, scope: str, max_calls: int, window_seconds: int, extra: str = "") -> None:
    if not allow(f"{scope}:{client_ip(request)}:{extra}", max_calls, window_seconds):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail={"error": "Too many requests. Please slow down and try again shortly."},
                            headers={"Retry-After": str(window_seconds)})


def reset() -> None:
    _hits.clear()
