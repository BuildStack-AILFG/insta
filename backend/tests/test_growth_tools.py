"""Growth tools: ig.me ref links, link-in-bio pages, Instagram Live comment automations, click reminders, AI copywriter."""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.services import scheduler
from app.services.ai import agent as ai_agent
from tests.conftest import db_session, texts


async def _referral(ws, ref: str, from_: str, username: str = "visitor") -> None:
    ws.meta.profiles[from_] = {"name": "Visitor", "username": username}
    await ws.webhook({"object": "instagram", "entry": [{"id": ws.ig_user_id, "time": int(time.time()), "messaging": [
        {"sender": {"id": from_}, "recipient": {"id": ws.ig_user_id}, "timestamp": int(time.time() * 1000),
         "referral": {"ref": ref, "source": "IG_ME", "type": "OPEN_THREAD"}}]}]})


# ---- ref links ---------------------------------------------------------------------------------------------------------

async def test_ref_link_opens_welcome_tag_and_counts(wsa, meta):
    r = await wsa.post("/growth/ref-links", json={"account_id": wsa.account["id"], "name": "Store QR", "ref": "store-qr", "tag": "offline",
                                                  "message": "Welcome from our store {{first_name}}! 🛍️", "buttons": [{"title": "Menu", "url": "https://shop.example.com/menu"}]})
    assert r.status_code == 201, r.text
    link = r.json()
    assert link["url"] == f"https://ig.me/m/{wsa.account['username']}?ref=store-qr" and "/api/public/qr?text=" in link["qr_url"]

    await _referral(wsa, "store-qr", "940000000001", "shopper")
    assert texts(meta) == ["[buttons] Welcome from our store Visitor! 🛍️"]
    assert meta.sent[0]["message"]["attachment"]["payload"]["buttons"][0]["url"].startswith("https://api.test/api/l/")
    await _referral(wsa, "store-qr", "940000000001", "shopper")  # tapped again: counted, but no second welcome
    assert len(meta.sent) == 1
    link = (await wsa.get("/growth/ref-links")).json()[0]
    assert link["opens"] == 2 and link["people"] == 1
    contact = (await wsa.get("/contacts", params={"q": "shopper"})).json()["items"][0]
    assert {"offline", "ref:store-qr"} <= set(contact["tags"])
    conv = (await wsa.get("/inbox/conversations")).json()["items"][0]
    assert conv["window_open"]  # the referral opened Instagram's reply window


async def test_ref_in_first_message_replaces_normal_automation_and_can_start_a_flow(wsa, meta):
    await wsa.post("/custom-replies", json={"trigger": "hi", "match_type": "contains", "reply_text": "Generic hello"})
    n = lambda id_, type_, **d: {"id": id_, "type": type_, "position": {"x": 0, "y": 0}, "data": d}  # noqa: E731
    g = {"nodes": [n("start", "start", trigger="manual"), n("m", "send_message", text="Flow says hi"), n("end", "end")],
         "edges": [{"id": "1", "source": "start", "target": "m"}, {"id": "2", "source": "m", "target": "end"}]}
    f = (await wsa.post("/flows", json={"name": "Ref flow", "trigger_type": "manual", "graph": g})).json()
    await wsa.post(f"/flows/{f['id']}/publish")
    await wsa.post("/growth/ref-links", json={"account_id": wsa.account["id"], "name": "Bio", "ref": "bio", "flow_id": f["id"]})
    await wsa.inbound(extra={"text": "hi there", "referral": {"ref": "bio", "source": "IG_ME"}}, from_="940000000011")
    assert texts(meta) == ["Flow says hi"]  # the ref link's flow answered, not the generic keyword reply


async def test_ref_link_validation(wsa, other):
    base = {"account_id": wsa.account["id"], "name": "X", "ref": "promo", "message": "hi"}
    assert (await wsa.post("/growth/ref-links", json={**base, "ref": "has space"})).status_code == 422
    assert (await wsa.post("/growth/ref-links", json={**base, "message": ""})).status_code == 422
    assert (await wsa.post("/growth/ref-links", json=base)).status_code == 201
    assert (await wsa.post("/growth/ref-links", json=base)).status_code == 409
    assert (await other.get("/growth/ref-links")).json() == []


# ---- link in bio -------------------------------------------------------------------------------------------------------

async def test_bio_page_public_view_and_click_tracking(wsa, app_client):
    ref = (await wsa.post("/growth/ref-links", json={"account_id": wsa.account["id"], "name": "Bio DM", "ref": "bio-dm", "message": "Hey! How can I help?"})).json()
    r = await wsa.post("/growth/bio-pages", json={"account_id": wsa.account["id"], "slug": "Glow-Studio", "title": "Glow Studio", "bio": "Skincare that works ✨",
                                                  "links": [{"title": "Shop", "url": "https://shop.example.com"}, {"title": "Book", "url": "https://cal.example.com"}],
                                                  "dm_button_text": "DM us", "dm_ref_link_id": ref["id"]})
    assert r.status_code == 201, r.text
    page = r.json()
    assert page["slug"] == "glow-studio"

    pub = (await app_client.get("/api/public/bio/glow-studio")).json()
    assert pub["title"] == "Glow Studio" and [l["title"] for l in pub["links"]] == ["Shop", "Book"] and "url" not in pub["links"][0]
    assert pub["dm_button"] == {"text": "DM us", "url": f"https://ig.me/m/{wsa.account['username']}?ref=bio-dm"}
    go = await app_client.get("/api/public/bio/glow-studio/go/1", follow_redirects=False)
    assert go.status_code == 302 and go.headers["location"] == "https://cal.example.com"
    page = (await wsa.get("/growth/bio-pages")).json()[0]
    assert page["views"] == 1 and page["links"][1]["clicks"] == 1

    # Editing keeps click counts for links that didn't change.
    upd = {**{k: page[k] for k in ("account_id", "slug", "title", "bio", "dm_button_text", "dm_ref_link_id", "published")}, "links": [{"title": "Book now", "url": "https://cal.example.com"}]}
    assert (await wsa.put(f"/growth/bio-pages/{page['id']}", json=upd)).json()["links"][0]["clicks"] == 1
    upd["published"] = False
    await wsa.put(f"/growth/bio-pages/{page['id']}", json=upd)
    assert (await app_client.get("/api/public/bio/glow-studio")).status_code == 404


async def test_bio_slug_rules(wsa, other, meta):
    base = {"account_id": wsa.account["id"], "slug": "taken-name"}
    assert (await wsa.post("/growth/bio-pages", json={**base, "slug": "dashboard"})).status_code == 422
    assert (await wsa.post("/growth/bio-pages", json={**base, "slug": "a b"})).status_code == 422
    assert (await wsa.post("/growth/bio-pages", json=base)).status_code == 201
    await other.connect(meta)
    assert (await other.post("/growth/bio-pages", json={"account_id": other.account["id"], "slug": "taken-name"})).status_code == 409


# ---- Instagram Live ------------------------------------------------------------------------------------------------------

async def test_live_automations_only_see_live_comments(wsa, meta):
    common = {"account_id": wsa.account["id"], "media_ids": [], "match_type": "contains", "keywords": ["link"], "public_reply_enabled": False}
    await wsa.post("/comment-automations", json={**common, "name": "Posts", "media_scope": "all", "dm_text": "Post DM"})
    await wsa.post("/comment-automations", json={**common, "name": "Live", "media_scope": "live", "dm_text": "Live DM"})
    await wsa.comment("link pls", from_="940000000021", field="live_comments")
    await wsa.comment("link pls", from_="940000000022")
    assert texts(meta) == ["Live DM", "Post DM"]


# ---- click reminders ---------------------------------------------------------------------------------------------------------

async def test_click_reminder_only_when_window_open_and_not_clicked(wsa, meta):
    body = {"account_id": wsa.account["id"], "name": "Guide", "media_scope": "all", "media_ids": [], "match_type": "contains", "keywords": ["guide"],
            "public_reply_enabled": False, "dm_text": "Here it is 👇", "dm_buttons": [{"title": "Get it", "url": "https://shop.example.com/g"}],
            "gate": "email", "reminder_enabled": True, "reminder_after_minutes": 30, "reminder_text": "Did you grab it? 👀"}
    a = (await wsa.post("/comment-automations", json=body)).json()
    assert a["reminder_enabled"] is True
    # Private-reply-only person (window never opens): no reminder possible.
    await wsa.comment("guide", from_="940000000031", username="silent")
    # Person who answered the email gate (window open) gets the link.
    await wsa.comment("guide", from_="940000000032", username="engaged")
    await wsa.inbound("me@mail.com", from_="940000000032", username="engaged")
    assert texts(meta)[-1] == "[buttons] Here it is 👇"

    from app.models.tracked_link import TrackedLink
    async with await db_session() as db:
        await db.execute(update(TrackedLink).where(TrackedLink.automation_id == a["id"]).values(created_at=datetime.now(timezone.utc) - timedelta(minutes=40)))
        await db.commit()
    meta.sent.clear()
    await scheduler.tick()
    assert texts(meta) == ["[buttons] Did you grab it? 👀"]
    await scheduler.tick()
    assert len(meta.sent) == 1  # once only
    assert (await wsa.get(f"/comment-automations/{a['id']}")).json()["stats"]["reminders_sent"] == 1


async def test_reminder_validation(wsa):
    body = {"account_id": wsa.account["id"], "name": "x", "media_scope": "all", "media_ids": [], "match_type": "any", "public_reply_enabled": False,
            "dm_text": "hi", "reminder_enabled": True}
    assert (await wsa.post("/comment-automations", json=body)).status_code == 422  # no link buttons to remind about


# ---- AI copywriter ---------------------------------------------------------------------------------------------------------

async def test_ai_copywriter(wsa, monkeypatch):
    assert (await wsa.post("/ai/write", json={"purpose": "dm", "brief": "serum price list"})).status_code == 409  # no AI key yet
    await wsa.put("/ai/config", json={"enabled": False, "api_key": "sk-ant-test-key-123456"})
    seen = {}

    async def complete(api_key, *, system, messages, model=None, max_tokens=700):
        seen["system"] = system
        return 'Here you go: ["Hey {{username}}! Price list 👇", "Your list is here ✨", "Sent! Check it out"]'
    monkeypatch.setattr(ai_agent, "complete", complete)
    r = await wsa.post("/ai/write", json={"purpose": "public_reply", "brief": "tell them to check DMs"})
    assert r.status_code == 200 and len(r.json()["options"]) == 3 and "public reply" in seen["system"]
    assert json.dumps(r.json())
