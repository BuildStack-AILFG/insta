"""Phase 6: media library uploads (served publicly for Instagram) and the content calendar (date ranges, drag to reschedule)."""

from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

from PIL import Image
from sqlalchemy import update

from app.core.config import get_settings
from app.services import media_library, scheduler
from tests.conftest import db_session


def _png(w: int = 1080, h: int = 1080, alpha: bool = True) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA" if alpha else "RGB", (w, h), (236, 72, 153, 128) if alpha else (236, 72, 153)).save(out, "PNG")
    return out.getvalue()


MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 2048


async def _upload(ws, *files: tuple[str, bytes]):
    return await ws.post("/media", files=[("files", (name, data, "application/octet-stream")) for name, data in files])


async def test_upload_converts_images_and_serves_them_publicly(wsa, app_client):
    r = await _upload(wsa, ("promo.png", _png(2000, 2000)), ("clip.mp4", MP4))
    assert r.status_code == 201, r.text
    img, vid = r.json()
    assert img["kind"] == "image" and img["content_type"] == "image/jpeg" and img["file_name"].endswith(".jpg")
    assert (img["width"], img["height"]) == (1440, 1440)  # downscaled to Instagram's max width
    assert img["url"] == f"https://api.test/api/files/{img['file_name']}"
    assert vid["kind"] == "video" and vid["content_type"] == "video/mp4" and vid["size"] == len(MP4)

    served = await app_client.get(f"/api/files/{img['file_name']}")  # no login: Instagram fetches it
    assert served.status_code == 200 and served.headers["content-type"] == "image/jpeg" and served.content[:3] == b"\xff\xd8\xff"
    assert (await app_client.get("/api/files/not-a-real-file-name-xx.jpg")).status_code == 404
    assert (await app_client.get("/api/files/..%2F..%2Fsecret.jpg")).status_code == 404

    lib = (await wsa.get("/media")).json()
    assert lib["total"] == 2 and lib["used_bytes"] == img["size"] + vid["size"] and lib["publicly_reachable"] is True
    assert (await wsa.get("/media", params={"kind": "video"})).json()["total"] == 1


async def test_upload_rejects_unknown_files_and_other_workspaces_cannot_see_them(wsa, other):
    r = await _upload(wsa, ("notes.txt", b"hello there, not an image"))
    assert r.status_code == 415 and "notes.txt" in r.json()["detail"]["error"]
    assert (await _upload(wsa, ("broken.jpg", b"\xff\xd8\xff" + b"garbage" * 10))).status_code == 422
    assert (await wsa.get("/media")).json()["total"] == 0  # nothing half-saved

    a = (await _upload(wsa, ("a.png", _png(alpha=False)))).json()[0]
    assert (await other.get("/media")).json()["total"] == 0
    assert (await other.delete(f"/media/{a['id']}")).status_code == 404


async def test_quota(wsa, monkeypatch):
    monkeypatch.setattr(media_library, "quota_bytes", lambda: len(MP4) + 10)
    assert (await _upload(wsa, ("one.mp4", MP4))).status_code == 201
    r = await _upload(wsa, ("two.mp4", MP4))
    assert r.status_code == 413 and "full" in r.json()["detail"]["error"]


async def test_post_with_library_files_publishes_from_our_public_url(wsa, meta):
    a = (await _upload(wsa, ("square.png", _png(1080, 1080))))
    asset = a.json()[0]
    r = await wsa.post("/posts", json={"account_id": wsa.account["id"], "kind": "image", "caption": "From the library", "media": [{"asset_id": asset["id"]}], "publish_now": True})
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["status"] == "published" and meta.published[-1]["image_url"] == asset["url"]
    assert p["media"][0]["asset_id"] == asset["id"] and p["media"][0]["type"] == "image"

    # A file used by a scheduled post can't be deleted; once nothing upcoming uses it, it can.
    when = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    s = (await wsa.post("/posts", json={"account_id": wsa.account["id"], "kind": "story", "media": [{"asset_id": asset["id"]}], "scheduled_at": when})).json()
    assert (await wsa.delete(f"/media/{asset['id']}")).status_code == 409
    await wsa.post(f"/posts/{s['id']}/cancel")
    assert (await wsa.delete(f"/media/{asset['id']}")).status_code == 204
    assert (await wsa.get("/media")).json()["total"] == 0


async def test_feed_aspect_ratio_and_other_workspaces_files(wsa, other, meta):
    tall = (await _upload(wsa, ("tall.png", _png(1080, 1920)))).json()[0]
    body = {"account_id": wsa.account["id"], "kind": "image", "caption": "", "media": [{"asset_id": tall["id"]}], "publish_now": True}
    r = await wsa.post("/posts", json=body)
    assert r.status_code == 422 and "4:5" in r.json()["detail"]["error"]
    assert (await wsa.post("/posts", json={**body, "kind": "story"})).status_code == 201  # stories take 9:16

    await other.connect(meta)
    r = await other.post("/posts", json={**body, "account_id": other.account["id"], "kind": "story"})
    assert r.status_code == 422 and "media library" in r.json()["detail"]["error"]


async def test_library_files_need_a_public_https_base(wsa, meta, monkeypatch):
    asset = (await _upload(wsa, ("s.png", _png()))).json()[0]
    monkeypatch.setattr(get_settings(), "public_base_url", "")
    body = {"account_id": wsa.account["id"], "kind": "image", "caption": "", "media": [{"asset_id": asset["id"]}]}
    r = await wsa.post("/posts", json={**body, "publish_now": True})
    assert r.status_code == 422 and "PUBLIC_BASE_URL" in r.json()["detail"]["error"]
    # Scheduling is allowed; if it's still unreachable when due, the post fails with the same explanation.
    when = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    p = (await wsa.post("/posts", json={**body, "scheduled_at": when})).json()
    assert p["status"] == "scheduled"
    from app.models.scheduled_post import ScheduledPost
    async with await db_session() as db:
        await db.execute(update(ScheduledPost).where(ScheduledPost.id == p["id"]).values(scheduled_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        await db.commit()
    published = len(meta.published)
    await scheduler.tick()
    post = (await wsa.get("/posts")).json()[0]
    assert post["status"] == "failed" and "PUBLIC_BASE_URL" in post["error"] and len(meta.published) == published


async def test_calendar_range_and_reschedule(wsa, other):
    now = datetime.now(timezone.utc)
    base = {"account_id": wsa.account["id"], "kind": "image", "caption": "", "media": [{"url": "https://cdn.example.com/a.jpg", "type": "image"}]}
    soon = (await wsa.post("/posts", json={**base, "scheduled_at": (now + timedelta(days=2)).isoformat()})).json()
    later = (await wsa.post("/posts", json={**base, "scheduled_at": (now + timedelta(days=40)).isoformat()})).json()

    week = (await wsa.get("/posts", params={"start": now.isoformat(), "end": (now + timedelta(days=7)).isoformat()})).json()
    assert [p["id"] for p in week] == [soon["id"]]

    target = (now + timedelta(days=5)).replace(microsecond=0)
    r = await wsa.post(f"/posts/{later['id']}/reschedule", json={"scheduled_at": target.isoformat()})
    assert r.status_code == 200 and datetime.fromisoformat(r.json()["scheduled_at"]) == target
    week = (await wsa.get("/posts", params={"start": now.isoformat(), "end": (now + timedelta(days=7)).isoformat()})).json()
    assert {p["id"] for p in week} == {soon["id"], later["id"]}

    assert (await wsa.post(f"/posts/{soon['id']}/reschedule", json={"scheduled_at": (now - timedelta(days=1)).isoformat()})).status_code == 422
    assert (await other.post(f"/posts/{soon['id']}/reschedule", json={"scheduled_at": target.isoformat()})).status_code == 404
    await wsa.post(f"/posts/{soon['id']}/cancel")
    assert (await wsa.post(f"/posts/{soon['id']}/reschedule", json={"scheduled_at": target.isoformat()})).status_code == 409
