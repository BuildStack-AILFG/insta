"""Mobile app push: device registration, and pushes for new conversations, taken-over chats and new orders (via Expo's push service)."""

from __future__ import annotations

import json

import httpx
import pytest

from app.services import push
from tests.test_shop import _checkout, _product, _store

TOKEN = "ExponentPushToken[abc123def456]"


class FakeExpo:
    def __init__(self):
        self.sent: list[dict] = []
        self.dead: set[str] = set()

    def handler(self, request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/--/api/v2/push/send"
        messages = json.loads(request.content)
        self.sent.extend(messages)
        return httpx.Response(200, json={"data": [
            {"status": "error", "message": "gone", "details": {"error": "DeviceNotRegistered"}} if m["to"] in self.dead else {"status": "ok", "id": "t"}
            for m in messages]})


@pytest.fixture
def expo():
    fake = FakeExpo()
    client = httpx.AsyncClient(transport=httpx.MockTransport(fake.handler))
    push._http_factory = lambda: client
    yield fake
    push._http_factory = None


async def _tokens(tenant_id: str) -> list[str]:
    import uuid
    from sqlalchemy import select
    from app.models.device_token import DeviceToken
    from tests.conftest import db_session
    async with await db_session() as db:
        return list((await db.execute(select(DeviceToken.token).where(DeviceToken.tenant_id == uuid.UUID(tenant_id)))).scalars())


async def test_register_validates_and_moves_a_phone_between_workspaces(ws, other):
    assert (await ws.post("/devices", json={"token": "not-a-token"})).status_code == 422
    assert (await ws.post("/devices", json={"token": TOKEN})).status_code == 204
    assert (await ws.post("/devices", json={"token": TOKEN})).status_code == 204  # idempotent
    assert await _tokens(ws.tenant_id) == [TOKEN]
    # Someone else signs in on the same phone: the token follows them.
    assert (await other.post("/devices", json={"token": TOKEN, "platform": "ios"})).status_code == 204
    assert await _tokens(ws.tenant_id) == [] and await _tokens(other.tenant_id) == [TOKEN]
    # Only the signed-in user can unregister their phone.
    assert (await ws.post("/devices/unregister", json={"token": TOKEN})).status_code == 204
    assert await _tokens(other.tenant_id) == [TOKEN]
    assert (await other.post("/devices/unregister", json={"token": TOKEN})).status_code == 204
    assert await _tokens(other.tenant_id) == []


async def test_new_conversation_and_taken_over_chat_push_but_bot_chats_do_not(wsa, expo):
    await wsa.post("/devices", json={"token": TOKEN})
    await wsa.inbound("Hi, is this available?", from_="900000000501", username="asha.rao")
    await push.drain()
    assert len(expo.sent) == 1
    first = expo.sent[0]
    assert first["to"] == TOKEN and first["title"] == "New message from @asha.rao" and "available" in first["body"]
    conv_id = first["data"]["conversation_id"]
    assert first["data"]["type"] == "message"

    await wsa.inbound("hello?", from_="900000000501")  # the bot still owns this chat
    await push.drain()
    assert len(expo.sent) == 1

    assert (await wsa.post(f"/inbox/conversations/{conv_id}/messages", json={"type": "text", "text": "Yes it is!"})).status_code in (200, 201)
    await wsa.inbound("Great, price?", from_="900000000501")  # an agent took over: every message pings the phone
    await push.drain()
    assert len(expo.sent) == 2 and expo.sent[1]["title"] == "@asha.rao" and expo.sent[1]["body"] == "Great, price?"


async def test_dead_tokens_are_pruned(wsa, expo):
    await wsa.post("/devices", json={"token": TOKEN})
    expo.dead.add(TOKEN)
    await wsa.inbound("hey", from_="900000000502")
    await push.drain()
    assert len(expo.sent) == 1 and await _tokens(wsa.tenant_id) == []


@pytest.mark.paid
async def test_new_order_pushes(ws, expo, app_client):
    store = await _store(ws)
    product = await _product(ws)
    await ws.post("/devices", json={"token": TOKEN})
    r = await app_client.post(f"/api/public/store/{store['slug']}/checkout", json=_checkout(product["id"], name="Meera"))
    assert r.status_code in (200, 201), r.text
    await push.drain()
    orders = [m for m in expo.sent if m["data"].get("type") == "order"]
    assert len(orders) == 1 and orders[0]["title"].startswith("New order #") and "COD" in orders[0]["body"] and "Meera" in orders[0]["body"]
