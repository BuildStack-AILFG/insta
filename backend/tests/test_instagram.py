"""Instagram channel: connecting accounts, the webhook, comment automations, DMs from the inbox and account maintenance."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from app.services import scheduler
from tests.conftest import db_session, sign, texts


def _automation(ws, **over) -> dict:
    body = {"account_id": ws.account["id"], "name": "Price DM", "media_scope": "specific", "media_ids": ["18000000000000001"],
            "media_preview": [{"id": "18000000000000001", "caption": "New drop", "thumbnail_url": "https://cdn.test/t.jpg"}],
            "match_type": "contains", "keywords": ["price", "link"], "public_replies": ["Sent you a DM {{username}}! 💌"],
            "dm_text": "Hi {{username}}, here's the price list 👇", "dm_buttons": [{"title": "See prices", "url": "https://shop.example.com/prices"}]}
    body.update(over)
    return body


async def _create(ws, **over) -> dict:
    r = await ws.post("/comment-automations", json=_automation(ws, **over))
    assert r.status_code == 201, r.text
    return r.json()


# ---- connecting accounts --------------------------------------------------------------------------------------------------------------------

async def test_connect_with_token_reads_profile_and_subscribes_webhooks(ws, meta):
    acct = await ws.connect(meta)
    assert acct["status"] == "connected" and acct["webhooks_subscribed"] and acct["username"].startswith("brand") and acct["followers_count"] == 1200
    assert acct["connection_type"] == "manual" and acct["token_expires_at"]
    assert any(c["path"].endswith(f"/{ws.ig_user_id}/subscribed_apps") and "comments" in c["params"]["subscribed_fields"] for c in meta.calls)
    assert "access_token" not in json.dumps((await ws.get("/instagram/accounts")).json())  # tokens never leave the server

    bad = await ws.post("/instagram/accounts", json={"access_token": "definitely-not-a-valid-token"})
    assert bad.status_code in (400, 402)


async def test_trial_allows_one_account_and_an_account_belongs_to_one_workspace(ws, other, meta):
    await ws.connect(meta)
    token, _ = meta.new_account()
    assert (await ws.post("/instagram/accounts", json={"access_token": token})).status_code == 402  # trial: 1 account
    stolen = next(t for t, a in meta.accounts.items() if a["user_id"] == ws.ig_user_id)
    r = await other.post("/instagram/accounts", json={"access_token": stolen})
    assert r.status_code == 409 and "another workspace" in r.json()["detail"]["error"]


async def test_personal_accounts_are_refused(ws, meta):
    token, _ = meta.new_account()
    meta.accounts[token]["account_type"] = "PERSONAL"
    r = await ws.post("/instagram/accounts", json={"access_token": token})
    assert r.status_code == 400 and "Professional" in r.json()["detail"]["error"]


async def test_oauth_login_round_trip_is_bound_to_the_workspace(ws, other):
    url = (await ws.get("/instagram/oauth/url")).json()["url"]
    assert url.startswith("https://www.instagram.com/oauth/authorize?") and "instagram_business_manage_comments" in url
    state = url.split("state=")[1].split("&")[0]
    from urllib.parse import unquote
    state = unquote(state)
    assert (await other.post("/instagram/oauth/callback", json={"code": "good-code", "state": state})).status_code == 403
    assert (await ws.post("/instagram/oauth/callback", json={"code": "bad-code", "state": state})).status_code == 400
    r = await ws.post("/instagram/oauth/callback", json={"code": "good-code", "state": state})
    assert r.status_code == 201, r.text
    assert r.json()["username"] == "oauthbrand" and r.json()["connection_type"] == "oauth" and "instagram_business_manage_messages" in r.json()["scopes"]


async def test_disconnect_keeps_history_and_stops_webhooks(wsa, meta):
    await wsa.inbound("hi")
    assert (await wsa.delete(f"/instagram/accounts/{wsa.account['id']}")).status_code == 204
    acct = (await wsa.get("/instagram/accounts")).json()[0]
    assert acct["status"] == "disconnected" and not acct["webhooks_subscribed"]
    r = await wsa.inbound("still there?")
    assert r.json()["messages"] == 0  # a disconnected account's events are ignored
    assert len((await wsa.get("/inbox/conversations", params={"status": "all"})).json()["items"]) == 1


# ---- webhook ---------------------------------------------------------------------------------------------------------------------------------

async def test_webhook_verification_and_signatures(app_client, wsa):
    ok = await app_client.get("/api/webhooks/instagram", params={"hub.mode": "subscribe", "hub.verify_token": "platform-verify", "hub.challenge": "42"})
    assert ok.status_code == 200 and ok.text == "42"
    assert (await app_client.get("/api/webhooks/instagram", params={"hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1"})).status_code == 403
    payload = {"object": "instagram", "entry": []}
    assert (await wsa.webhook(payload, signature="sha256=deadbeef")).status_code == 401
    assert (await wsa.webhook(payload, signature=sign(json.dumps(payload).encode(), "other-secret"))).status_code == 401
    assert (await wsa.webhook({"object": "page", "entry": []})).json()["ignored"] is True


async def test_inbound_dm_creates_contact_with_profile_and_dedupes(wsa, meta):
    r = await wsa.inbound("Hey!", from_="900000000101", name="Riya Kapoor", username="riya.k", mid="aWdfDUP1")
    assert r.json()["messages"] == 1
    assert (await wsa.inbound("Hey!", from_="900000000101", mid="aWdfDUP1")).json()["duplicates"] == 1  # Meta retries: processed once
    conv = (await wsa.get("/inbox/conversations")).json()["items"][0]
    assert conv["contact"]["username"] == "riya.k" and conv["contact"]["name"] == "Riya Kapoor" and conv["contact"]["is_follower"] is True
    assert conv["window_open"] and conv["unread_count"] == 1
    msgs = (await wsa.get(f"/inbox/conversations/{conv['id']}/messages")).json()["items"]
    assert [m["body"] for m in msgs] == ["Hey!"]


async def test_story_mentions_replies_attachments_and_reactions(wsa):
    await wsa.inbound(extra={"attachments": [{"type": "story_mention", "payload": {"url": "https://cdn.test/story.mp4"}}]}, from_="900000000111")
    await wsa.inbound(extra={"text": "love this", "reply_to": {"story": {"id": "st1", "url": "https://cdn.test/s1.jpg"}}}, from_="900000000111")
    await wsa.inbound(extra={"attachments": [{"type": "image", "payload": {"url": "https://cdn.test/photo.jpg"}}]}, from_="900000000111")
    cid = (await wsa.get("/inbox/conversations")).json()["items"][0]["id"]
    msgs = (await wsa.get(f"/inbox/conversations/{cid}/messages")).json()["items"]
    assert [m["type"] for m in msgs] == ["story_mention", "story_reply", "image"]
    assert msgs[0]["media_url"] == "https://cdn.test/story.mp4" and msgs[1]["payload"]["story"]["id"] == "st1" and msgs[2]["has_media"]


async def test_echoes_from_the_instagram_app_and_seen_receipts(wsa, meta):
    import time
    await wsa.inbound("hello", from_="900000000121")
    cid = (await wsa.get("/inbox/conversations")).json()["items"][0]["id"]
    await wsa.post(f"/inbox/conversations/{cid}/messages", json={"type": "text", "text": "Hi from the dashboard"})
    ours = meta.sent[-1]["_mid"]
    echo = lambda mid, text: {"object": "instagram", "entry": [{"id": wsa.ig_user_id, "time": 1, "messaging": [  # noqa: E731
        {"sender": {"id": wsa.ig_user_id}, "recipient": {"id": "900000000121"}, "timestamp": int(time.time() * 1000), "message": {"mid": mid, "text": text, "is_echo": True}}]}]}
    await wsa.webhook(echo(ours, "Hi from the dashboard"))  # our own send: not duplicated
    await wsa.webhook(echo("aWdfPHONE1", "Typed on my phone"))  # sent from the Instagram app: added to the inbox
    await wsa.webhook({"object": "instagram", "entry": [{"id": wsa.ig_user_id, "time": 1, "messaging": [
        {"sender": {"id": "900000000121"}, "recipient": {"id": wsa.ig_user_id}, "timestamp": int(time.time() * 1000) + 5000, "read": {"mid": ours}}]}]})
    msgs = (await wsa.get(f"/inbox/conversations/{cid}/messages")).json()["items"]
    assert [m["body"] for m in msgs] == ["hello", "Hi from the dashboard", "Typed on my phone"]
    assert msgs[1]["status"] == "read" and msgs[2]["payload"]["via"] == "instagram_app"


async def test_ice_breaker_postback_triggers_a_custom_reply(wsa, meta):
    r = await wsa.patch(f"/instagram/accounts/{wsa.account['id']}", json={"ice_breakers": [{"question": "What are your prices?", "payload": "PRICES"}]})
    assert r.status_code == 200 and r.json()["ice_breakers"] == [{"question": "What are your prices?", "payload": "PRICES"}]
    assert meta.ice_breakers[0]["call_to_actions"][0]["question"] == "What are your prices?"
    await wsa.post("/custom-replies", json={"trigger": "What are your prices?", "match_type": "exact", "reply_text": "Plans start at ₹499"})
    await wsa.postback("PRICES", "What are your prices?", from_="900000000131")
    assert texts(meta) == ["Plans start at ₹499"]


# ---- comment automations --------------------------------------------------------------------------------------------------------------------

async def test_comment_automation_validation(wsa):
    assert (await wsa.post("/comment-automations", json=_automation(wsa, keywords=[]))).status_code == 422
    assert (await wsa.post("/comment-automations", json=_automation(wsa, media_ids=[]))).status_code == 422
    assert (await wsa.post("/comment-automations", json=_automation(wsa, public_reply_enabled=False, dm_enabled=False))).status_code == 422
    assert (await wsa.post("/comment-automations", json=_automation(wsa, dm_text="  "))).status_code == 422
    assert (await wsa.post("/comment-automations", json=_automation(wsa, dm_buttons=[{"title": "x" * 21, "url": "https://a.io"}]))).status_code == 422
    ok = await wsa.post("/comment-automations", json=_automation(wsa, keywords=[" Price ", "price", "LINK"]))
    assert ok.status_code == 201 and ok.json()["keywords"] == ["Price", "LINK"]  # trimmed and de-duplicated case-insensitively


async def test_keyword_comment_gets_public_reply_and_dm_with_button(wsa, meta):
    a = await _create(wsa)
    r = await wsa.comment("What's the PRICE??", from_="900000000201", username="asha.rao", comment_id="17900000000000001")
    assert r.status_code == 200 and r.json()["comments"] == 1
    assert meta.comment_replies == [{"comment_id": "17900000000000001", "message": "Sent you a DM @asha.rao! 💌"}]
    dm = meta.sent[-1]
    assert dm["recipient"] == {"comment_id": "17900000000000001"}  # a private reply, addressed by comment
    assert dm["message"]["attachment"]["payload"]["text"] == "Hi @asha.rao, here's the price list 👇"
    button = dm["message"]["attachment"]["payload"]["buttons"][0]
    assert button["type"] == "web_url" and button["title"] == "See prices" and button["url"].startswith("https://api.test/api/l/")  # click-tracked redirect

    stats = (await wsa.get(f"/comment-automations/{a['id']}")).json()["stats"]
    assert stats == {"comments_matched": 1, "public_replies_sent": 1, "dms_sent": 1, "gates_passed": 0, "link_clicks": 0, "reminders_sent": 0}
    act = (await wsa.get("/comment-automations/activity/comments")).json()["items"][0]
    assert act["outcome"] == "matched" and act["public_reply"] and act["dm_sent"] and act["automation"]["name"] == "Price DM" and act["username"] == "asha.rao"

    # The DM shows up in the inbox on the commenter's conversation, and the contact is tagged.
    conv = (await wsa.get("/inbox/conversations")).json()["items"][0]
    assert conv["contact"]["username"] == "asha.rao" and not conv["window_open"]  # a private reply doesn't open the 24h window
    msgs = (await wsa.get(f"/inbox/conversations/{conv['id']}/messages")).json()["items"]
    assert msgs[0]["sender_type"] == "comment" and msgs[0]["payload"]["comment_text"] == "What's the PRICE??"
    contact = (await wsa.get(f"/contacts/{conv['contact']['id']}")).json()
    assert "commented:Price DM" in contact["tags"] and contact["source"] == "comment"


async def test_non_matching_excluded_repeat_and_own_comments(wsa, meta):
    await _create(wsa, exclude_keywords=["refund"])
    await wsa.comment("nice pic", from_="900000000211")
    await wsa.comment("price? I want a refund", from_="900000000212")
    await wsa.comment("price", media_id="18000000000009999", from_="900000000213")  # a different post
    await wsa.comment("price", from_=wsa.ig_user_id, username="brand")  # our own reply coming back through the webhook
    assert not meta.sent and not meta.comment_replies
    await wsa.comment("price", from_="900000000214")
    await wsa.comment("price again pls", from_="900000000214")  # once per person
    assert len(meta.sent) == 1 and len(meta.comment_replies) == 1
    outcomes = sorted(i["outcome"] for i in (await wsa.get("/comment-automations/activity/comments")).json()["items"])
    assert outcomes == ["matched", "no_match", "no_match", "no_match", "skipped_repeat"]  # own comments are hidden from the log


async def test_duplicate_webhook_delivery_replies_once(wsa, meta):
    await _create(wsa)
    for _ in range(3):
        await wsa.comment("price", from_="900000000221", comment_id="17900000000000221")
    assert len(meta.sent) == 1 and len(meta.comment_replies) == 1


async def test_specific_post_beats_all_posts_and_exact_match(wsa, meta):
    await _create(wsa, name="Everywhere", media_scope="all", media_ids=[], match_type="any", keywords=[], dm_text="General DM", public_replies=["General"])
    await _create(wsa, name="Launch", match_type="exact", keywords=["LAUNCH"], dm_text="Launch DM", public_replies=["Launch!"])
    await wsa.comment("launch", from_="900000000231")
    await wsa.comment("launch today?", from_="900000000232")  # exact match fails -> falls back to the all-posts automation
    assert [r["message"] for r in meta.comment_replies] == ["Launch!", "General"]


async def test_paused_automation_and_tenant_scoping(wsa, other, meta):
    a = await _create(wsa)
    assert (await wsa.patch(f"/comment-automations/{a['id']}", json={"status": "paused"})).json()["status"] == "paused"
    await wsa.comment("price", from_="900000000241")
    assert not meta.sent
    for call in (other.get(f"/comment-automations/{a['id']}"), other.put(f"/comment-automations/{a['id']}", json=_automation(wsa)),
                 other.patch(f"/comment-automations/{a['id']}", json={"status": "active"}), other.delete(f"/comment-automations/{a['id']}")):
        assert (await call).status_code == 404
    assert (await other.get("/comment-automations")).json() == []
    assert (await other.post("/comment-automations", json=_automation(wsa))).status_code == 422  # not their account


async def test_next_post_automation_binds_to_the_first_new_post(wsa, meta):
    a = await _create(wsa, media_scope="next", media_ids=[])
    meta.media["18000000000000500"] = {"id": "18000000000000500", "caption": "Old post", "timestamp": "2020-01-01T10:00:00+0000"}
    meta.media["18000000000000501"] = {"id": "18000000000000501", "caption": "Brand new reel", "media_url": "https://cdn.test/r.mp4",
                                       "timestamp": (datetime.now(timezone.utc) + timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%S+0000")}
    await wsa.comment("price", media_id="18000000000000500", from_="900000000251")
    assert not meta.sent  # an older post doesn't count
    await wsa.comment("price", media_id="18000000000000501", from_="900000000252")
    assert len(meta.sent) == 1
    a = (await wsa.get(f"/comment-automations/{a['id']}")).json()
    assert a["media_scope"] == "specific" and a["media_ids"] == ["18000000000000501"] and a["media_preview"][0]["caption"] == "Brand new reel"


async def test_comment_dm_failure_is_logged(wsa, meta):
    await _create(wsa)
    meta.fail_next(400, 10, "This message is sent outside of allowed window.")  # the public reply fails…
    await wsa.comment("price", from_="900000000261")
    act = (await wsa.get("/comment-automations/activity/comments")).json()["items"][0]
    assert act["outcome"] == "matched" and not act["public_reply"] and act["dm_sent"] and "Public reply failed" in act["error"]  # …the DM still goes


async def test_opted_out_contacts_get_no_comment_dm(wsa, meta):
    await wsa.inbound("STOP", from_="900000000271")
    meta.sent.clear()
    await _create(wsa)
    await wsa.comment("price", from_="900000000271")
    assert not meta.sent and len(meta.comment_replies) == 1  # public reply only


async def test_reply_to_comment_dm_starts_the_follow_up_flow(wsa, meta):
    n = lambda id_, type_, **data: {"id": id_, "type": type_, "position": {"x": 0, "y": 0}, "data": data}  # noqa: E731
    g = {"nodes": [n("start", "start", trigger="manual"), n("ask", "ask_question", question="What's your email? I'll send the catalogue.", key="email", validation="email"),
                   n("done", "send_link_buttons", body="Thanks! Here it is:", buttons=[{"title": "Catalogue", "url": "https://shop.example.com/c.pdf"}]), n("end", "end")],
         "edges": [{"id": "1", "source": "start", "target": "ask"}, {"id": "2", "source": "ask", "target": "done", "sourceHandle": "success"}, {"id": "3", "source": "done", "target": "end"}]}
    f = (await wsa.post("/flows", json={"name": "Catalogue", "trigger_type": "manual", "graph": g})).json()
    assert (await wsa.post(f"/flows/{f['id']}/publish")).status_code == 200
    await _create(wsa, flow_id=f["id"])
    await wsa.comment("link please", from_="900000000281")
    meta.sent.clear()
    await wsa.inbound("yes!", from_="900000000281")  # their reply opens the window and continues in the flow
    assert texts(meta) == ["What's your email? I'll send the catalogue."]
    await wsa.inbound("dev@shop.io", from_="900000000281")
    assert texts(meta)[-1] == "[buttons] Thanks! Here it is:"
    await wsa.inbound("thanks", from_="900000000281")
    assert len(meta.sent) == 2  # the flow finished and the follow-up only ever starts once


async def test_comment_automation_quota(wsa):
    for i in range(5):
        await _create(wsa, name=f"A{i}")
    r = await wsa.post("/comment-automations", json=_automation(wsa, name="one too many"))
    assert r.status_code == 402 and r.json()["detail"]["quota"] == "max_comment_automations"


# ---- inbox sends ------------------------------------------------------------------------------------------------------------------------------

async def test_inbox_sends_text_buttons_and_media_inside_the_window(wsa, meta):
    await wsa.inbound("hi", from_="900000000301")
    cid = (await wsa.get("/inbox/conversations")).json()["items"][0]["id"]
    assert (await wsa.post(f"/inbox/conversations/{cid}/messages", json={"type": "text", "text": "Hello!"})).status_code == 201
    r = await wsa.post(f"/inbox/conversations/{cid}/messages", json={"type": "buttons", "text": "Order here", "buttons": [{"title": "Shop", "url": "https://shop.example.com"}]})
    assert r.status_code == 201 and r.json()["payload"]["buttons"][0]["url"] == "https://shop.example.com"
    assert (await wsa.post(f"/inbox/conversations/{cid}/messages", json={"type": "image", "media_url": "https://cdn.example.com/p.jpg"})).status_code == 201
    assert (await wsa.post(f"/inbox/conversations/{cid}/messages", json={"type": "image"})).status_code == 422
    assert texts(meta) == ["Hello!", "[buttons] Order here", "[attachment] https://cdn.example.com/p.jpg"]
    assert all(m["recipient"] == {"id": "900000000301"} for m in meta.sent)


async def test_window_rules_and_human_agent_tag(wsa, meta):
    await wsa.inbound("hi", from_="900000000311")
    cid = (await wsa.get("/inbox/conversations")).json()["items"][0]["id"]
    from app.models.conversation import Conversation
    async with await db_session() as db:
        await db.execute(update(Conversation).where(Conversation.id == cid).values(last_inbound_at=datetime.now(timezone.utc) - timedelta(days=2)))
        await db.commit()
    r = await wsa.post(f"/inbox/conversations/{cid}/messages", json={"type": "text", "text": "Sorry for the delay"})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "outside_window"
    await wsa.patch(f"/instagram/accounts/{wsa.account['id']}", json={"human_agent_tag": True})
    assert (await wsa.post(f"/inbox/conversations/{cid}/messages", json={"type": "text", "text": "Sorry for the delay"})).status_code == 201
    assert meta.sent[-1]["tag"] == "HUMAN_AGENT" and meta.sent[-1]["messaging_type"] == "MESSAGE_TAG"


async def test_start_conversation_requires_an_instagram_contact(wsa):
    c = (await wsa.post("/contacts", json={"name": "Phone only", "phone": "919811177777"})).json()
    r = await wsa.post("/inbox/conversations", json={"contact_id": c["id"]})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "no_instagram_id"


# ---- maintenance -------------------------------------------------------------------------------------------------------------------------------

@pytest.mark.paid
async def test_scheduler_refreshes_expiring_tokens_and_flags_problems(wsa, meta):
    from app.models.instagram_account import InstagramAccount
    async with await db_session() as db:
        await db.execute(update(InstagramAccount).where(InstagramAccount.tenant_id == wsa.tenant_id).values(
            token_expires_at=datetime.now(timezone.utc) + timedelta(days=3), last_synced_at=None))
        await db.commit()
    assert any("expires soon" in i["title"] for i in (await wsa.get("/notifications")).json()["items"])
    stats = await scheduler.tick()
    assert stats["tokens_refreshed"] >= 1
    acct = (await wsa.get("/instagram/accounts")).json()[0]
    assert datetime.fromisoformat(acct["token_expires_at"]) > datetime.now(timezone.utc) + timedelta(days=50)
    assert not any("expires soon" in i["title"] for i in (await wsa.get("/notifications")).json()["items"])


async def test_media_picker_lists_recent_posts(wsa, meta):
    meta.media["18000000000000900"] = {"id": "18000000000000900", "caption": "Summer sale", "media_type": "IMAGE", "media_url": "https://cdn.test/s.jpg",
                                       "permalink": "https://instagram.com/p/x", "timestamp": "2026-09-01T10:00:00+0000", "comments_count": 12}
    r = (await wsa.get(f"/instagram/accounts/{wsa.account['id']}/media")).json()
    item = next(i for i in r["items"] if i["id"] == "18000000000000900")
    assert item["thumbnail_url"] == "https://cdn.test/s.jpg" and item["comments_count"] == 12
