"""
Standalone fake Instagram Graph API for local end-to-end runs (no Meta app needed):

    uvicorn tests.fake_meta_server:app --port 9100
    INSTAGRAM_GRAPH_BASE=http://127.0.0.1:9100   # in the backend's environment

`GET /__token` issues a token for a fresh professional account — paste it into "Connect with access token".
`GET /__sent` lists every DM the backend tried to send; `GET /__replies` lists public comment replies;
`POST /__media` seeds the posts the media picker shows ([{id, caption, media_url, timestamp, ...}]); `POST /__profile` defines who is
behind a sender id ({id, username, name}).
"""

from __future__ import annotations

import httpx
from fastapi import FastAPI, Request, Response

from tests.conftest import FakeInstagram

app = FastAPI()
fake = FakeInstagram()


@app.get("/__token")
async def token(username: str | None = None) -> dict:
    tok, ig_id = fake.new_account(username)
    return {"access_token": tok, "ig_user_id": ig_id}


@app.get("/__sent")
async def sent() -> list[dict]:
    return fake.sent


@app.get("/__replies")
async def replies() -> list[dict]:
    return fake.comment_replies


@app.post("/__media")
async def seed_media(request: Request) -> dict:
    for m in await request.json():
        fake.media[m["id"]] = m
    return {"count": len(fake.media)}


@app.post("/__profile")
async def seed_profile(request: Request) -> dict:
    p = await request.json()
    fake.profiles[p["id"]] = {"name": p.get("name"), "username": p.get("username"), "profile_pic": p.get("profile_pic"),
                              "follower_count": p.get("follower_count", 120), "is_user_follow_business": p.get("follows", True)}
    return {"ok": True}


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def anything(path: str, request: Request) -> Response:
    body = await request.body()
    req = httpx.Request(request.method, str(request.url), headers=dict(request.headers), content=body)
    resp = fake.handler(req)
    return Response(content=resp.content, status_code=resp.status_code, media_type=resp.headers.get("content-type", "application/json"))
