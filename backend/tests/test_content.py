"""Phase 4: scheduled publishing (photo, carousel, reel, story) and insights."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from app.services import scheduler
from app.services.instagram import insights as insights_svc
from tests.conftest import db_session


def _post(ws, **over) -> dict:
    body = {"account_id": ws.account["id"], "kind": "image", "caption": "New drop ✨ #skincare", "media": [{"url": "https://cdn.example.com/a.jpg", "type": "image"}]}
    body.update(over)
    return body


@pytest.fixture(autouse=True)
def _fresh_insights():
    insights_svc.clear_cache()


async def test_publish_photo_now_with_first_comment(wsa, meta):
    r = await wsa.post("/posts", json=_post(wsa, first_comment="Link in bio 👆", publish_now=True))
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["status"] == "published" and p["permalink"].startswith("https://instagram.com/p/") and p["ig_media_id"]
    assert meta.published[-1]["image_url"] == "https://cdn.example.com/a.jpg" and meta.published[-1]["caption"] == "New drop ✨ #skincare"
    assert meta.media_comments_posted == [{"media_id": p["ig_media_id"], "message": "Link in bio 👆"}]


async def test_scheduled_reel_waits_for_its_time_and_video_processing(wsa, meta):
    when = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
    p = (await wsa.post("/posts", json=_post(wsa, kind="reel", media=[{"url": "https://cdn.example.com/r.mp4", "type": "video"}], scheduled_at=when))).json()
    assert p["status"] == "scheduled"
    await scheduler.tick()
    assert (await wsa.get("/posts")).json()[0]["status"] == "scheduled"  # not due yet

    from app.models.scheduled_post import ScheduledPost
    async with await db_session() as db:
        await db.execute(update(ScheduledPost).where(ScheduledPost.id == p["id"]).values(scheduled_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        await db.commit()
    await scheduler.tick()  # container created, video still processing
    assert (await wsa.get("/posts")).json()[0]["status"] == "processing"
    await scheduler.tick()
    await scheduler.tick()
    post = (await wsa.get("/posts")).json()[0]
    assert post["status"] == "published", post
    assert meta.published[-1]["media_type"] == "REELS" and meta.published[-1]["video_url"] == "https://cdn.example.com/r.mp4"


async def test_carousel_and_story(wsa, meta):
    meta.video_polls = 0
    media = [{"url": "https://cdn.example.com/1.jpg", "type": "image"}, {"url": "https://cdn.example.com/2.mp4", "type": "video"}]
    p = (await wsa.post("/posts", json=_post(wsa, kind="carousel", media=media, publish_now=True))).json()
    assert p["status"] == "published", p
    carousel = meta.published[-1]
    assert carousel["media_type"] == "CAROUSEL" and len(carousel["children"].split(",")) == 2
    children = [meta.containers[c]["params"] for c in carousel["children"].split(",")]
    assert all(c["is_carousel_item"] == "true" for c in children) and children[1]["media_type"] == "VIDEO"

    s = (await wsa.post("/posts", json=_post(wsa, kind="story", caption="", first_comment="ignored", publish_now=True))).json()
    assert s["status"] == "published" and meta.published[-1]["media_type"] == "STORIES"
    assert not any(c["media_id"] == s["ig_media_id"] for c in meta.media_comments_posted)  # stories can't have comments
    meta.video_polls = 1


async def test_post_validation_cancel_and_limit(wsa, meta, other):
    assert (await wsa.post("/posts", json=_post(wsa, kind="reel"))).status_code == 422  # a reel needs a video
    assert (await wsa.post("/posts", json=_post(wsa, kind="carousel"))).status_code == 422  # needs 2+ items
    assert (await wsa.post("/posts", json=_post(wsa, media=[{"url": "http://insecure.example.com/a.jpg", "type": "image"}]))).status_code == 422
    assert (await wsa.post("/posts", json=_post(wsa, caption="#a " * 31))).status_code == 422
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    assert (await wsa.post("/posts", json=_post(wsa, scheduled_at=past))).status_code == 422

    when = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    p = (await wsa.post("/posts", json=_post(wsa, scheduled_at=when))).json()
    assert (await other.post(f"/posts/{p['id']}/cancel")).status_code == 404
    assert (await wsa.post(f"/posts/{p['id']}/cancel")).json()["status"] == "cancelled"
    await wsa.post("/posts", json=_post(wsa, publish_now=True))
    lim = (await wsa.get("/posts/limit", params={"account_id": wsa.account["id"]})).json()
    assert lim["limit"] == 100 and lim["used"] >= 1


async def test_failed_processing_is_reported(wsa, meta):
    meta.override = lambda req: __import__("httpx").Response(200, json={"id": "x", "status_code": "ERROR"}) if req.method == "GET" and "/cont" in req.url.path else None
    p = (await wsa.post("/posts", json=_post(wsa, publish_now=True))).json()
    assert p["status"] == "failed" and "couldn't process" in p["error"]


async def test_account_insights_demographics_and_media(wsa, meta):
    meta.insight_values.update({"reach": 1200, "views": 5400})
    a = (await wsa.get("/insights/account", params={"account_id": wsa.account["id"], "days": 7})).json()
    assert a["totals"]["reach"] == 1200 and a["totals"]["views"] == 5400 and a["follows"] == 40 and a["unfollows"] == 7
    assert [d["reach"] for d in a["reach_series"]] == [1200, 1201]
    d = (await wsa.get("/insights/demographics", params={"account_id": wsa.account["id"], "breakdown": "country"})).json()
    assert d["items"][0] == {"label": "IN", "value": 800}
    meta.media["18000000000004444"] = {"id": "18000000000004444", "caption": "Reel", "media_type": "VIDEO", "media_product_type": "REELS", "media_url": "https://cdn.test/v.mp4"}
    m = (await wsa.get("/insights/media", params={"account_id": wsa.account["id"]})).json()
    item = next(i for i in m["items"] if i["id"] == "18000000000004444")
    assert item["metrics"]["reach"] == 1200 and item["metrics"]["likes"] == 3


async def test_insights_skip_metrics_instagram_rejects():
    from app.services.instagram.graph import GraphClient
    import httpx
    from app.services.instagram import graph as graph_mod

    def handler(request):
        metrics = request.url.params.get("metric", "")
        if "bad" in metrics:
            return httpx.Response(400, json={"error": {"message": "invalid metric", "code": 100}})
        return httpx.Response(200, json={"data": [{"name": metrics, "total_value": {"value": 1}}]})
    old = graph_mod._http_factory
    graph_mod._http_factory = lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler))
    try:
        out = await GraphClient("t", "1").insights("1", ["reach", "bad", "views"])
    finally:
        graph_mod._http_factory = old
    assert [x["name"] for x in out] == ["reach", "views"]
