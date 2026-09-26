"""
Account and media insights from the Instagram API, normalised for the dashboard and cached for a few minutes (the insights
endpoints are rate limited, and Instagram only updates most numbers every few hours anyway).
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.instagram_account import InstagramAccount
from app.services.instagram.accounts import client_for

CACHE_SECONDS = 600
_cache: dict[tuple, tuple[float, Any]] = {}

ACCOUNT_TOTALS = ["views", "reach", "accounts_engaged", "total_interactions", "likes", "comments", "shares", "saves", "profile_links_taps"]
MEDIA_METRICS = ["reach", "likes", "comments", "shares", "saved", "total_interactions", "views"]
BREAKDOWNS = ("country", "city", "age", "gender")


async def _cached(key: tuple, fn):
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    value = await fn()
    _cache[key] = (time.monotonic(), value)
    return value


def clear_cache() -> None:
    _cache.clear()


def _range(days: int) -> tuple[int, int]:
    until = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    since = until - timedelta(days=days)
    return int(since.timestamp()), int(until.timestamp())


async def account_overview(account: InstagramAccount, days: int) -> dict:
    async def load() -> dict:
        client = client_for(account)
        since, until = _range(days)
        totals_raw = await client.insights(account.ig_user_id, ACCOUNT_TOTALS, period="day", metric_type="total_value", since=since, until=until)
        totals = {m.get("name"): int((m.get("total_value") or {}).get("value") or 0) for m in totals_raw}
        # follows_and_unfollows split by follow_type: FOLLOWER = accounts that followed, NON_FOLLOWER = accounts that unfollowed.
        follow_raw = await client.insights(account.ig_user_id, ["follows_and_unfollows"], period="day", metric_type="total_value",
                                           breakdown="follow_type", since=since, until=until)
        follows = unfollows = 0
        for m in follow_raw:
            for b in (m.get("total_value") or {}).get("breakdowns") or []:
                for r in b.get("results") or []:
                    kind = str((r.get("dimension_values") or [""])[0]).upper()
                    if kind == "FOLLOWER":
                        follows += int(r.get("value") or 0)
                    elif kind == "NON_FOLLOWER":
                        unfollows += int(r.get("value") or 0)
        series_raw = await client.insights(account.ig_user_id, ["reach"], period="day", since=since, until=until)
        series = [{"date": str(v.get("end_time", ""))[:10], "reach": int(v.get("value") or 0)}
                  for m in series_raw for v in (m.get("values") or []) if isinstance(v.get("value"), (int, float))]
        return {"days": days, "totals": totals, "follows": follows, "unfollows": unfollows, "reach_series": series,
                "followers_count": account.followers_count, "media_count": account.media_count}
    return await _cached(("overview", account.id, days), load)


async def demographics(account: InstagramAccount, breakdown: str) -> list[dict]:
    """Top follower segments (Instagram only returns these for accounts with 100+ followers)."""
    async def load() -> list[dict]:
        raw = await client_for(account).insights(account.ig_user_id, ["follower_demographics"], period="lifetime", metric_type="total_value",
                                                 timeframe="this_month", breakdown=breakdown)
        out = []
        for m in raw:
            for b in (m.get("total_value") or {}).get("breakdowns") or []:
                for r in b.get("results") or []:
                    out.append({"label": " / ".join(str(x) for x in r.get("dimension_values") or []), "value": int(r.get("value") or 0)})
        return sorted(out, key=lambda x: -x["value"])[:15]
    return await _cached(("demo", account.id, breakdown), load)


async def recent_media(account: InstagramAccount, limit: int) -> list[dict]:
    async def load() -> list[dict]:
        client = client_for(account)
        media = (await client.list_media(limit=limit)).get("data", [])
        out = []
        for m in media:
            if m.get("media_product_type") == "STORY":
                continue
            raw = await client.insights(str(m["id"]), MEDIA_METRICS)
            metrics = {x.get("name"): int(((x.get("values") or [{}])[0].get("value")) or (x.get("total_value") or {}).get("value") or 0) for x in raw}
            out.append({"id": m.get("id"), "caption": (m.get("caption") or "")[:200], "media_type": m.get("media_type"), "media_product_type": m.get("media_product_type"),
                        "thumbnail_url": m.get("thumbnail_url") or m.get("media_url"), "permalink": m.get("permalink"), "timestamp": m.get("timestamp"),
                        "like_count": m.get("like_count"), "comments_count": m.get("comments_count"), "metrics": metrics})
        return out
    return await _cached(("media", account.id, limit), load)
