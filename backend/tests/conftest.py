"""
Test harness: a real Postgres, the real FastAPI app over an ASGI transport, and a fake Instagram Graph API behind
httpx.MockTransport so every Instagram path runs without network access.

Database: TEST_DATABASE_URL, or by default a `gramforgrow_test` database on the same server as backend/.env's DATABASE_URL
(the gramforgrow-db container) — created on first run and wiped at the start of every run. Never wap's database.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent.parent
APP_SECRET = "test-app-secret"


def _default_test_db() -> str:
    env_file = ROOT / ".env"
    line = next((l for l in env_file.read_text().splitlines() if l.startswith("DATABASE_URL=")), "") if env_file.exists() else ""
    url = line.split("=", 1)[1].strip() if line else "postgresql://gramforgrow:gramforgrow@localhost:5434/gramforgrow"
    parts = urlsplit(url.replace("postgresql+asyncpg://", "postgresql://").replace("postgres://", "postgresql://"))
    return urlunsplit(parts._replace(path="/gramforgrow_test", query=""))


os.environ.setdefault("ENVIRONMENT", "test")
DB = os.environ.get("TEST_DATABASE_URL") or _default_test_db()
os.environ["DATABASE_URL"] = DB.replace("postgresql://", "postgresql+asyncpg://")
os.environ["DATABASE_URL_SYNC"] = DB.replace("postgresql://", "postgresql+psycopg://")
os.environ.update(JWT_SECRET="test-jwt", REFRESH_TOKEN_SECRET="test-refresh", ENCRYPTION_KEY="test-encryption-key", SCHEDULER_ENABLED="false",
                  PUBLIC_BASE_URL="https://api.test", FRONTEND_URL="https://app.test", INSTAGRAM_WEBHOOK_VERIFY_TOKEN="platform-verify",
                  INSTAGRAM_APP_ID="1234567890", INSTAGRAM_APP_SECRET=APP_SECRET, CORS_ORIGINS="https://app.test")
os.environ["MEDIA_DIR"] = tempfile.mkdtemp(prefix="gramforgrow-media-")

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402

sys.path.insert(0, str(ROOT))

from app.core import ratelimit  # noqa: E402
from app.services.instagram import graph  # noqa: E402


def _ensure_database(sync_url: str) -> None:
    import sqlalchemy as sa
    name = urlsplit(sync_url.replace("postgresql+psycopg://", "postgresql://")).path.lstrip("/")
    admin = sa.create_engine(sync_url.rsplit("/", 1)[0] + "/postgres", isolation_level="AUTOCOMMIT")
    with admin.connect() as c:
        if not c.execute(sa.text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": name}).first():
            c.execute(sa.text(f'CREATE DATABASE "{name}"'))
    admin.dispose()


def pytest_sessionstart(session):  # noqa: ARG001
    """Fresh schema + migrations + plan seed, once per run."""
    env = {**os.environ}
    import sqlalchemy as sa
    _ensure_database(env["DATABASE_URL_SYNC"])
    eng = sa.create_engine(env["DATABASE_URL_SYNC"])
    with eng.begin() as c:
        c.execute(sa.text("DROP SCHEMA public CASCADE"))
        c.execute(sa.text("CREATE SCHEMA public"))
    eng.dispose()
    for cmd in ([sys.executable, "-m", "alembic", "upgrade", "head"], [sys.executable, "scripts/seed_plans.py"]):
        subprocess.run(cmd, cwd=ROOT, env=env, check=True, capture_output=True)


def pytest_collection_modifyitems(items):
    """Run every async test on the one session-wide loop, so the shared SQLAlchemy engine's connections stay valid."""
    import inspect
    for item in items:
        if inspect.iscoroutinefunction(getattr(item, "function", None)):
            item.add_marker(pytest.mark.asyncio(loop_scope="session"), append=False)


class FakeInstagram:
    """Stands in for graph.instagram.com / api.instagram.com. Records every call; supports failure injection."""

    def __init__(self):
        self.calls: list[dict] = []
        self.sent: list[dict] = []            # POST /{ig-user-id}/messages bodies (+ "_mid")
        self.comment_replies: list[dict] = [] # POST /{comment-id}/replies
        self.fail_queue: list[tuple[int, dict]] = []
        self.token = "good-token-" + "x" * 20
        self.valid_tokens = {self.token}
        self.override = None  # optional callable(request) -> httpx.Response | None, consulted first
        self.accounts: dict[str, dict] = {}   # token -> /me payload
        self.profiles: dict[str, dict] = {}   # igsid -> user profile
        self.media: dict[str, dict] = {}      # media id -> media object
        self.media_comments: dict[str, list[dict]] = {}  # media id -> comments (GET /{media}/comments)
        self.hidden: dict[str, bool] = {}     # comment id -> hidden
        self.deleted: set[str] = set()
        self.containers: dict[str, dict] = {}  # container id -> {params, polls, status}
        self.video_polls = 1                  # video containers report IN_PROGRESS this many times before FINISHED
        self.published: list[dict] = []
        self.media_comments_posted: list[dict] = []
        self.insight_values: dict[str, int] = {}  # metric -> value returned by /insights
        self.ice_breakers: list | None = None
        self._n = 0

    def fail_next(self, status: int, code: int, message: str = "boom") -> None:
        self.fail_queue.append((status, {"error": {"message": message, "code": code}}))

    def new_account(self, username: str | None = None) -> tuple[str, str]:
        """Issue a token for a fresh professional account. Returns (token, ig_user_id)."""
        self._n += 1
        ig_id = f"1784{uuid.uuid4().int % 10**13:013d}"
        token = f"tok-{ig_id}-" + "x" * 20
        self.valid_tokens.add(token)
        self.accounts[token] = {"id": f"app{self._n}", "user_id": ig_id, "username": username or f"brand{self._n}", "name": "Acme Store",
                                "account_type": "BUSINESS", "profile_picture_url": "https://cdn.test/p.jpg", "followers_count": 1200, "media_count": 42}
        return token, ig_id

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        body: dict = {}
        if request.content and request.headers.get("content-type", "").startswith("application/json"):
            body = json.loads(request.content)
        params = dict(request.url.params)
        self.calls.append({"method": request.method, "host": request.url.host, "path": path, "body": body, "params": params})
        if self.override is not None and (forced := self.override(request)) is not None:
            return forced

        # OAuth token endpoints (no bearer header).
        if request.url.host == "api.instagram.com" and path == "/oauth/access_token":
            form = dict(x.split("=", 1) for x in request.content.decode().split("&"))
            if form.get("code") != "good-code":
                return httpx.Response(400, json={"error_type": "OAuthException", "code": 400, "error_message": "Invalid authorization code"})
            token, ig_id = self.new_account("oauthbrand")
            return httpx.Response(200, json={"access_token": "short-" + token, "user_id": ig_id, "permissions": "instagram_business_basic,instagram_business_manage_messages"})
        if path == "/access_token" and params.get("grant_type") == "ig_exchange_token":
            return httpx.Response(200, json={"access_token": params["access_token"].removeprefix("short-"), "token_type": "bearer", "expires_in": 5183944})
        if path == "/refresh_access_token":
            return httpx.Response(200, json={"access_token": params["access_token"], "token_type": "bearer", "expires_in": 5183944})

        token = request.headers.get("authorization", "").replace("Bearer ", "")
        if token not in self.valid_tokens:
            return httpx.Response(401, json={"error": {"message": "Invalid OAuth access token.", "code": 190}})
        me = self.accounts.get(token, {"id": "app0", "user_id": "17840000000000", "username": "brand", "account_type": "BUSINESS"})
        if self.fail_queue and request.method == "POST" and (path.endswith("/messages") or path.endswith("/replies")):
            status, payload = self.fail_queue.pop(0)
            return httpx.Response(status, json=payload)

        m = re.match(r"^/v[\d.]+/(.*)$", path)
        rest = m.group(1) if m else path.lstrip("/")
        if request.method == "GET" and rest == "me":
            return httpx.Response(200, json=me)
        if rest.endswith("/subscribed_apps"):
            return httpx.Response(200, json={"success": True})
        if request.method == "POST" and rest.endswith("/messages"):
            if body.get("sender_action"):
                return httpx.Response(200, json={"recipient_id": body["recipient"].get("id")})
            self._n += 1
            mid = f"aWdfZAG1faKE{self._n:05d}"
            self.sent.append({"_mid": mid, **body})
            return httpx.Response(200, json={"recipient_id": body["recipient"].get("id") or "commenter", "message_id": mid})
        if request.method == "POST" and rest.endswith("/replies"):
            self._n += 1
            self.comment_replies.append({"comment_id": rest.split("/")[0], "message": params.get("message")})
            return httpx.Response(200, json={"id": f"reply{self._n}"})
        if rest == "me/messenger_profile":
            self.ice_breakers = None if request.method == "DELETE" else body.get("ice_breakers")
            return httpx.Response(200, json={"result": "success"})
        if request.method == "POST" and rest.endswith("/media_publish"):
            c = self.containers.get(params.get("creation_id", ""))
            if not c or c["status"] != "FINISHED":
                return httpx.Response(400, json={"error": {"message": "Media ID is not available", "code": 9007}})
            self._n += 1
            media_id = f"1790{self._n:011d}"
            c["status"] = "PUBLISHED"
            self.published.append({"media_id": media_id, **c["params"]})
            self.media[media_id] = {"id": media_id, "caption": c["params"].get("caption"), "permalink": f"https://instagram.com/p/{media_id}", "timestamp": "2026-09-26T10:00:00+0000"}
            return httpx.Response(200, json={"id": media_id})
        if request.method == "POST" and rest.endswith("/media"):
            self._n += 1
            cid = f"cont{self._n}"
            is_video = "video_url" in params
            self.containers[cid] = {"params": params, "polls": 0, "status": "IN_PROGRESS" if is_video and self.video_polls else "FINISHED"}
            return httpx.Response(200, json={"id": cid})
        if request.method == "GET" and rest in self.containers:
            c = self.containers[rest]
            if c["status"] == "IN_PROGRESS":
                c["polls"] += 1
                if c["polls"] > self.video_polls:
                    c["status"] = "FINISHED"
            return httpx.Response(200, json={"id": rest, "status_code": c["status"]})
        if request.method == "GET" and rest.endswith("/content_publishing_limit"):
            return httpx.Response(200, json={"data": [{"quota_usage": len(self.published), "config": {"quota_total": 100, "quota_duration": 86400}}]})
        if request.method == "GET" and rest.endswith("/insights"):
            metrics = params.get("metric", "").split(",")
            if params.get("breakdown") == "follow_type":
                return httpx.Response(200, json={"data": [{"name": "follows_and_unfollows", "total_value": {"breakdowns": [{"dimension_keys": ["follow_type"], "results": [
                    {"dimension_values": ["FOLLOWER"], "value": 40}, {"dimension_values": ["NON_FOLLOWER"], "value": 7}]}]}}]})
            if params.get("breakdown"):
                return httpx.Response(200, json={"data": [{"name": "follower_demographics", "total_value": {"breakdowns": [{"results": [
                    {"dimension_values": ["IN"], "value": 800}, {"dimension_values": ["US"], "value": 120}]}]}}]})
            if "unsupported_metric" in metrics and len(metrics) > 1:
                return httpx.Response(400, json={"error": {"message": "metric[0] must be one of the following values", "code": 100}})
            if metrics == ["unsupported_metric"]:
                return httpx.Response(400, json={"error": {"message": "metric[0] must be one of the following values", "code": 100}})
            if params.get("metric_type") == "total_value":
                return httpx.Response(200, json={"data": [{"name": m, "total_value": {"value": self.insight_values.get(m, 5)}} for m in metrics]})
            return httpx.Response(200, json={"data": [{"name": m, "values": [{"value": self.insight_values.get(m, 3), "end_time": "2026-09-25T07:00:00+0000"},
                                                                            {"value": self.insight_values.get(m, 3) + 1, "end_time": "2026-09-26T07:00:00+0000"}]} for m in metrics]})
        if request.method == "POST" and rest.endswith("/comments"):
            self._n += 1
            self.media_comments_posted.append({"media_id": rest.split("/")[0], "message": params.get("message")})
            return httpx.Response(200, json={"id": f"c{self._n}"})
        if request.method == "GET" and rest.endswith("/comments"):
            items = self.media_comments.get(rest.split("/")[0], [])
            after = int(params.get("after") or 0)
            page = items[after:after + 50]
            nxt = {"next": f"https://graph.instagram.com/v23.0/{rest}?after={after + 50}"} if after + 50 < len(items) else {}
            return httpx.Response(200, json={"data": page, "paging": nxt})
        if request.method == "DELETE" and re.fullmatch(r"\d+", rest):
            self.deleted.add(rest)
            return httpx.Response(200, json={"success": True})
        if request.method == "GET" and rest.endswith("/media"):
            return httpx.Response(200, json={"data": list(self.media.values()), "paging": {"cursors": {"after": "c1"}}})
        if request.method == "GET" and rest in self.media:
            return httpx.Response(200, json=self.media[rest])
        if request.method == "GET" and rest in self.profiles:
            return httpx.Response(200, json=self.profiles[rest])
        if request.method == "POST" and re.fullmatch(r"\d+", rest) and "hide" in params:
            self.hidden[rest] = params["hide"] == "true"
            return httpx.Response(200, json={"success": True})
        return httpx.Response(404, json={"error": {"message": f"unhandled fake route {request.method} {path}", "code": 100}})


# Kept for older helpers/tests that still say `meta`.
FakeMeta = FakeInstagram


@pytest.fixture(scope="session")
def meta() -> FakeInstagram:
    fake = FakeInstagram()
    client = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
    graph._http_factory = lambda: client
    return fake


@pytest_asyncio.fixture(scope="session")
async def app_client(meta):  # noqa: ARG001 — meta must be installed first
    from app.main import app
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="https://api.test") as c:
        yield c


@pytest.fixture(autouse=True)
def _reset(meta):
    ratelimit.reset()
    meta.calls.clear()
    meta.sent.clear()
    meta.comment_replies.clear()
    meta.fail_queue.clear()
    meta.override = None


def sign(body: bytes, secret: str = APP_SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


class Workspace:
    """A registered tenant with a logged-in owner, plus helpers to drive the API."""

    def __init__(self, client: httpx.AsyncClient, data: dict):
        self.client = client
        self.email = data["email"]
        self.tenant_id = data["workspace"]["id"]
        self.user_id = data["user_id"]
        self.token = data["access_token"]
        self.refresh_token = data["refresh_token"]
        self.account: dict | None = None
        self.ig_user_id: str | None = None
        self.meta: FakeInstagram | None = None

    @property
    def h(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}

    async def get(self, path, **kw):
        return await self.client.get(f"/api{path}", headers=self.h, **kw)

    async def post(self, path, **kw):
        return await self.client.post(f"/api{path}", headers=self.h, **kw)

    async def put(self, path, **kw):
        return await self.client.put(f"/api{path}", headers=self.h, **kw)

    async def patch(self, path, **kw):
        return await self.client.patch(f"/api{path}", headers=self.h, **kw)

    async def delete(self, path, **kw):
        return await self.client.delete(f"/api{path}", headers=self.h, **kw)

    async def connect(self, meta: FakeInstagram) -> dict:
        """Connect an Instagram account through the real token-paste endpoint (validated against the fake Graph API)."""
        token, self.ig_user_id = meta.new_account()
        self.meta = meta
        r = await self.post("/instagram/accounts", json={"access_token": token})
        assert r.status_code == 201, r.text
        self.account = r.json()
        return self.account

    def _profile(self, igsid: str, name: str | None, username: str | None) -> None:
        # Real IGSIDs are scoped to the business account, so each inbound call (re)defines who is behind the id.
        if self.meta is not None:
            self.meta.profiles[igsid] = {"name": name, "username": username or f"user{igsid[-4:]}", "profile_pic": "https://cdn.test/u.jpg",
                                         "follower_count": 10, "is_user_follow_business": True}

    async def inbound(self, text: str = "hi", *, from_: str = "900000000001", name: str | None = "Asha", username: str | None = None, mid: str | None = None,
                      wamid: str | None = None, extra: dict | None = None, msg_type: str = "text") -> httpx.Response:
        """Deliver a signed inbound Instagram DM. `extra` replaces the message object's content (attachments, quick_reply, reply_to…)."""
        assert self.account and self.ig_user_id
        self._profile(from_, name, username)
        message = {"mid": mid or wamid or f"aWdfIN{uuid.uuid4().hex[:12]}"}
        message.update(extra if extra is not None else {"text": text})
        return await self.webhook({"object": "instagram", "entry": [{"id": self.ig_user_id, "time": int(time.time()), "messaging": [
            {"sender": {"id": from_}, "recipient": {"id": self.ig_user_id}, "timestamp": int(time.time() * 1000), "message": message}]}]})

    async def postback(self, payload: str, title: str, *, from_: str = "900000000001") -> httpx.Response:
        return await self.webhook({"object": "instagram", "entry": [{"id": self.ig_user_id, "time": int(time.time()), "messaging": [
            {"sender": {"id": from_}, "recipient": {"id": self.ig_user_id}, "timestamp": int(time.time() * 1000),
             "postback": {"mid": f"aWdfPB{uuid.uuid4().hex[:12]}", "title": title, "payload": payload}}]}]})

    async def comment(self, text: str, *, media_id: str = "18000000000000001", from_: str = "900000000001", username: str = "asha.rao",
                      comment_id: str | None = None, parent_id: str | None = None, field: str = "comments") -> httpx.Response:
        """Deliver a signed `comments` webhook for a post."""
        value = {"from": {"id": from_, "username": username}, "media": {"id": media_id, "media_product_type": "FEED"},
                 "id": comment_id or str(uuid.uuid4().int % 10**17), "text": text}
        if parent_id:
            value["parent_id"] = parent_id
        return await self.webhook({"object": "instagram", "entry": [{"id": self.ig_user_id, "time": int(time.time()), "changes": [{"field": field, "value": value}]}]})

    async def webhook(self, payload: dict, *, signature: str | None = None) -> httpx.Response:
        raw = json.dumps(payload).encode()
        return await self.client.post("/api/webhooks/instagram", content=raw,
                                      headers={"content-type": "application/json", "x-hub-signature-256": signature or sign(raw)})


_counter = 0


@pytest_asyncio.fixture
async def ws(app_client, request) -> Workspace:
    """A fresh workspace on the free trial. Mark a test `@pytest.mark.paid` to start it on the Growth plan (every feature unlocked)."""
    global _counter
    _counter += 1
    email = f"owner{_counter}-{uuid.uuid4().hex[:6]}@example.com"
    r = await app_client.post("/api/auth/register", json={"company_name": f"Acme {_counter}", "full_name": "Owner", "email": email, "password": "Str0ng!Passw0rd#42"})
    assert r.status_code == 201, r.text
    workspace = Workspace(app_client, r.json())
    await _maybe_paid(request, workspace)
    return workspace


async def _maybe_paid(request, workspace: Workspace) -> None:
    """`@pytest.mark.paid` puts the workspace on the Growth plan (every feature unlocked)."""
    if request.node.get_closest_marker("paid"):
        from sqlalchemy import update
        from app.models.tenant import Tenant
        async with await db_session() as db:
            await db.execute(update(Tenant).where(Tenant.id == uuid.UUID(workspace.tenant_id)).values(plan_id="growth"))
            await db.commit()


@pytest_asyncio.fixture
async def wsa(ws, meta) -> Workspace:
    """Workspace with a connected Instagram account."""
    await ws.connect(meta)
    return ws


@pytest_asyncio.fixture
async def other(app_client, request) -> Workspace:
    global _counter
    _counter += 1
    r = await app_client.post("/api/auth/register", json={"company_name": f"Other {_counter}", "email": f"other{_counter}-{uuid.uuid4().hex[:6]}@example.com", "password": "Str0ng!Passw0rd#42"})
    workspace = Workspace(app_client, r.json())
    await _maybe_paid(request, workspace)
    return workspace


async def db_session():
    from app.db import session as s
    return s.async_session_factory()


def texts(meta: FakeInstagram) -> list[str]:
    """What we DMed, in order: plain text, '[buttons] <text>' for button templates, '[attachment] <url>' for media."""
    out = []
    for m in meta.sent:
        msg = m.get("message") or {}
        if "text" in msg:
            out.append(msg["text"])
        elif (msg.get("attachment") or {}).get("type") == "template":
            out.append("[buttons] " + msg["attachment"]["payload"]["text"])
        elif msg.get("attachment"):
            out.append("[attachment] " + msg["attachment"]["payload"]["url"])
    return out
