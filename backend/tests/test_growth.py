"""Phase 2 growth features: unlock gates on comment automations, DM link click tracking, story auto-replies, per-post analytics."""

from __future__ import annotations

from tests.conftest import texts


def _automation(ws, **over) -> dict:
    body = {"account_id": ws.account["id"], "name": "Guide", "media_scope": "all", "media_ids": [], "match_type": "contains", "keywords": ["guide"],
            "public_replies": ["Check your DMs {{username}}!"], "dm_text": "Here's your guide {{username}} 👇",
            "dm_buttons": [{"title": "Download", "url": "https://shop.example.com/guide.pdf"}]}
    body.update(over)
    return body


async def _create(ws, **over) -> dict:
    r = await ws.post("/comment-automations", json=_automation(ws, **over))
    assert r.status_code == 201, r.text
    return r.json()


def _follows(meta, igsid: str, follows: bool, username: str = "fan.one") -> None:
    meta.profiles[igsid] = {"name": "Fan One", "username": username, "is_user_follow_business": follows}


# ---- follow gate ---------------------------------------------------------------------------------------------------

async def test_follow_gate_sends_the_link_only_after_they_follow(wsa, meta):
    a = await _create(wsa, gate="follow", gate_prompt="Tap below and I'll send it 👇", gate_button="Send it")
    await wsa.comment("GUIDE pls", from_="910000000301", username="fan.one")
    first = meta.sent[-1]
    assert first["recipient"]["comment_id"]  # the unlock step goes out as the private reply
    btn = first["message"]["attachment"]["payload"]["buttons"][0]
    assert btn["type"] == "postback" and btn["title"] == "Send it" and btn["payload"].startswith("GATE:")
    assert "guide.pdf" not in str(first)  # the link itself isn't sent yet

    _follows(meta, "910000000301", False)
    meta.sent.clear()
    await wsa.postback(btn["payload"], "Send it", from_="910000000301")
    assert "Follow @" in texts(meta)[0] and "guide.pdf" not in str(meta.sent)
    reminder = meta.sent[0]["message"]["attachment"]["payload"]["buttons"]
    assert reminder[0]["type"] == "postback" and reminder[1]["url"].startswith("https://instagram.com/")

    _follows(meta, "910000000301", True)
    meta.sent.clear()
    await wsa.postback(btn["payload"], "Send it", from_="910000000301")
    assert texts(meta) == ["[buttons] Here's your guide @fan.one 👇"]
    tracked = meta.sent[0]["message"]["attachment"]["payload"]["buttons"][0]["url"]
    assert tracked.startswith("https://api.test/api/l/")

    await wsa.postback(btn["payload"], "Send it", from_="910000000301")  # tapping again re-sends, but only counts once
    stats = (await wsa.get(f"/comment-automations/{a['id']}")).json()["stats"]
    assert stats["gates_passed"] == 1 and stats["dms_sent"] == 1
    contact = (await wsa.get("/contacts", params={"q": "fan.one"})).json()["items"][0]
    assert contact["is_follower"] is True


async def test_gate_taps_from_someone_else_are_ignored(wsa, meta):
    await _create(wsa, gate="follow")
    await wsa.comment("guide", from_="910000000311", username="fan.two")
    payload = meta.sent[-1]["message"]["attachment"]["payload"]["buttons"][0]["payload"]
    _follows(meta, "910000000312", True, "intruder")
    meta.sent.clear()
    await wsa.postback(payload, "Send me the link", from_="910000000312")
    assert "guide.pdf" not in str(meta.sent)


# ---- email / phone gates --------------------------------------------------------------------------------------------

async def test_email_gate_captures_a_valid_email_then_delivers(wsa, meta):
    a = await _create(wsa, gate="email")
    await wsa.comment("guide", from_="910000000321", username="lead.one")
    assert meta.sent[-1]["message"]["text"].startswith("Drop your email")
    meta.sent.clear()
    await wsa.inbound("sure!", from_="910000000321", name="Lead One", username="lead.one")
    assert "doesn't look like an email" in texts(meta)[-1]
    await wsa.inbound("it's Lead.One@Mail.com thanks", from_="910000000321", name="Lead One", username="lead.one")
    assert texts(meta)[-1] == "[buttons] Here's your guide @lead.one 👇"
    contact = (await wsa.get("/contacts", params={"q": "lead.one"})).json()["items"][0]
    assert contact["email"] == "lead.one@mail.com" and "lead" in contact["tags"]
    assert (await wsa.get(f"/comment-automations/{a['id']}")).json()["stats"]["gates_passed"] == 1


async def test_phone_gate_and_giving_up_after_three_bad_answers(wsa, meta):
    await wsa.patch("/settings", json={"settings": {"default_country_code": "91"}})
    await wsa.post("/custom-replies", json={"trigger": "hello", "match_type": "contains", "reply_text": "Hi there!"})
    await _create(wsa, gate="phone")
    await wsa.comment("guide", from_="910000000331", username="lead.two")
    await wsa.inbound("98111 22334", from_="910000000331", username="lead.two")
    assert texts(meta)[-1] == "[buttons] Here's your guide @lead.two 👇"
    assert (await wsa.get("/contacts", params={"q": "lead.two"})).json()["items"][0]["phone"] == "919811122334"

    await wsa.comment("guide again", from_="910000000332", username="lead.three")
    for bad in ("no", "nope"):
        await wsa.inbound(bad, from_="910000000332", username="lead.three")
        assert "phone number" in texts(meta)[-1]
    meta.sent.clear()
    await wsa.inbound("hello", from_="910000000332", username="lead.three")  # third miss: the gate gives up, normal replies take over
    assert texts(meta) == ["Hi there!"]


async def test_gate_validation(wsa):
    r = await wsa.post("/comment-automations", json=_automation(wsa, gate="follow", dm_enabled=False))
    assert r.status_code == 422
    assert (await wsa.post("/comment-automations", json=_automation(wsa, gate="sms"))).status_code == 422


# ---- click tracking -------------------------------------------------------------------------------------------------

async def test_dm_links_are_tracked_per_person(wsa, meta, app_client):
    a = await _create(wsa)
    await wsa.comment("guide", from_="910000000341", username="clicker")
    url = meta.sent[-1]["message"]["attachment"]["payload"]["buttons"][0]["url"]
    path = url.replace("https://api.test", "")
    r = await app_client.get(path, follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "https://shop.example.com/guide.pdf"
    await app_client.get(path, follow_redirects=False)  # repeat clicks by the same person count once toward the automation
    assert (await wsa.get(f"/comment-automations/{a['id']}")).json()["stats"]["link_clicks"] == 1
    contact = (await wsa.get("/contacts", params={"q": "clicker"})).json()["items"][0]
    assert "clicked:Guide" in contact["tags"]
    assert (await app_client.get("/api/l/does-not-exist", follow_redirects=False)).status_code == 404

    # The inbox shows the real destination, not the redirect.
    conv = (await wsa.get("/inbox/conversations")).json()["items"][0]
    msgs = (await wsa.get(f"/inbox/conversations/{conv['id']}/messages")).json()["items"]
    assert msgs[0]["payload"]["buttons"][0]["url"] == "https://shop.example.com/guide.pdf"


async def test_tracking_can_be_turned_off(wsa, meta):
    await _create(wsa, track_clicks=False)
    await wsa.comment("guide", from_="910000000351", username="plain")
    assert meta.sent[-1]["message"]["attachment"]["payload"]["buttons"][0]["url"] == "https://shop.example.com/guide.pdf"


# ---- story auto-replies ---------------------------------------------------------------------------------------------

async def test_story_mention_auto_reply_with_cooldown_and_tag(wsa, meta):
    r = await wsa.patch("/settings", json={"settings": {"auto_replies": {"story_mention": {
        "enabled": True, "message": "Thanks for the shoutout {{first_name}}! 💖", "link_title": "10% off", "link_url": "https://shop.example.com/fan", "tag": "story-fan"}}}})
    assert r.status_code == 200, r.text
    mention = {"attachments": [{"type": "story_mention", "payload": {"url": "https://cdn.test/s.mp4"}}]}
    await wsa.inbound(extra=mention, from_="910000000361", name="Zoya Khan", username="zoya")
    assert texts(meta) == ["[buttons] Thanks for the shoutout Zoya! 💖"]
    assert meta.sent[0]["message"]["attachment"]["payload"]["buttons"][0]["url"].startswith("https://api.test/api/l/")
    await wsa.inbound(extra=mention, from_="910000000361", name="Zoya Khan", username="zoya")
    assert len(meta.sent) == 1  # at most one thank-you a day
    assert "story-fan" in (await wsa.get("/contacts", params={"q": "zoya"})).json()["items"][0]["tags"]

    bad = await wsa.patch("/settings", json={"settings": {"auto_replies": {"story_reply": {"enabled": True, "message": "Hi", "link_title": "Shop"}}}})
    assert bad.status_code == 422


# ---- analytics -------------------------------------------------------------------------------------------------------

async def test_analytics_top_posts_and_link_clicks(wsa, meta, app_client):
    await wsa.patch("/settings", json={"settings": {}})
    from sqlalchemy import update
    from app.models.tenant import Tenant
    from tests.conftest import db_session
    async with await db_session() as db:
        await db.execute(update(Tenant).where(Tenant.id == wsa.tenant_id).values(plan_id="growth"))
        await db.commit()
    await _create(wsa, media_scope="specific", media_ids=["18000000000000777"], media_preview=[{"id": "18000000000000777", "caption": "Guide reel", "thumbnail_url": "https://cdn.test/g.jpg"}])
    for i in range(3):
        await wsa.comment("guide" if i < 2 else "nice", media_id="18000000000000777", from_=f"91000000037{i}", username=f"u{i}")
    url = meta.sent[-1]["message"]["attachment"]["payload"]["buttons"][0]["url"]
    await app_client.get(url.replace("https://api.test", ""), follow_redirects=False)
    a = (await wsa.get("/analytics/overview", params={"days": 7})).json()
    top = a["top_posts"][0]
    assert top["media_id"] == "18000000000000777" and top["comments"] == 3 and top["matched"] == 2 and top["dms"] == 2 and top["caption"] == "Guide reel"
    assert a["links"] == {"sent": 2, "clicks": 1, "clicked": 1}
