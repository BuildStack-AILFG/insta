"""Phase 3: comment moderation, giveaways and A/B DM variants."""

from __future__ import annotations

import pytest

import json

from app.services.ai import agent as ai_agent
from tests.conftest import texts


async def _automation(ws, **over) -> dict:
    body = {"account_id": ws.account["id"], "name": "Price", "media_scope": "all", "media_ids": [], "match_type": "contains", "keywords": ["price"],
            "public_replies": ["Check DMs!"], "dm_text": "Variant A {{username}}", "dm_buttons": [{"title": "Shop", "url": "https://shop.example.com"}]}
    body.update(over)
    r = await ws.post("/comment-automations", json=body)
    assert r.status_code == 201, r.text
    return r.json()


# ---- moderation -------------------------------------------------------------------------------------------------------

async def test_moderation_rules_hide_spam_before_automations(wsa, meta):
    r = await wsa.patch("/settings", json={"settings": {"moderation": {"enabled": True, "keywords": ["Free followers", "scam"], "hide_links": True, "max_mentions": 3}}})
    assert r.status_code == 200, r.text
    await _automation(wsa)
    await wsa.comment("price? also FREE followers here", from_="920000000001", comment_id="1790000000000001")
    await wsa.comment("price check bit.ly/xyz", from_="920000000002", comment_id="1790000000000002")
    await wsa.comment("@a @b @c @d price", from_="920000000003", comment_id="1790000000000003")
    await wsa.comment("price please", from_="920000000004", comment_id="1790000000000004")
    assert meta.hidden == {"1790000000000001": True, "1790000000000002": True, "1790000000000003": True}
    assert len(meta.comment_replies) == 1 and len(meta.sent) == 1  # only the clean comment got a reply and a DM
    items = (await wsa.get("/comment-automations/activity/comments", params={"outcome": "moderated"})).json()["items"]
    assert {i["moderation_reason"] for i in items} == {"keyword: Free followers", "contains a link", "more than 3 mentions"}

    row = next(i for i in items if i["comment_id"] == "1790000000000001")
    r = await wsa.post(f"/comment-automations/activity/comments/{row['id']}/moderate", json={"action": "unhide"})
    assert r.status_code == 200 and r.json()["moderation"] is None and meta.hidden["1790000000000001"] is False


async def test_moderation_can_delete_and_use_ai(wsa, meta, monkeypatch):
    await wsa.put("/ai/config", json={"enabled": False, "api_key": "sk-ant-test-key-123456"})
    await wsa.patch("/settings", json={"settings": {"moderation": {"enabled": True, "use_ai": True, "action": "delete"}}})

    async def complete(api_key, *, system, messages, model=None, max_tokens=700):
        return "spam" if "earn" in messages[-1]["content"] else "ok"
    monkeypatch.setattr(ai_agent, "complete", complete)
    await wsa.comment("DM me to earn 50k a week!!", from_="920000000011", comment_id="1790000000000011")
    await wsa.comment("love this", from_="920000000012", comment_id="1790000000000012")
    assert meta.deleted == {"1790000000000011"}
    items = (await wsa.get("/comment-automations/activity/comments")).json()["items"]
    spam = next(i for i in items if i["comment_id"] == "1790000000000011")
    assert spam["outcome"] == "moderated" and spam["moderation"] == "deleted" and spam["moderation_reason"] == "AI: spam"


async def test_moderation_settings_validation(wsa):
    assert (await wsa.patch("/settings", json={"settings": {"moderation": {"enabled": True, "action": "ban"}}})).status_code == 422
    assert (await wsa.patch("/settings", json={"settings": {"moderation": {"enabled": "yes"}}})).status_code == 422


# ---- giveaways -------------------------------------------------------------------------------------------------------

def _comments(n: int, **extra) -> list[dict]:
    return [{"id": f"1780000000{i:06d}", "text": extra.get("text", "count me in @friend1 @friend2"), "username": f"user{i}", "from": {"id": f"93{i:010d}", "username": f"user{i}"},
             "timestamp": f"2026-09-2{i % 9}T10:00:00+0000"} for i in range(n)]


@pytest.mark.paid
async def test_giveaway_draw_applies_entry_rules(wsa, meta):
    media = "18000000000000999"
    comments = _comments(60)  # spans two pages of comments
    comments += [
        {"id": "1781", "text": "me @a @b", "username": "user1", "from": {"id": "930000000001", "username": "user1"}, "timestamp": "2026-09-29T10:00:00+0000"},  # repeat
        {"id": "1782", "text": "only @one", "username": "lazy", "from": {"id": "931", "username": "lazy"}, "timestamp": "2026-09-29T10:00:00+0000"},  # 1 mention
        {"id": "1783", "text": "@a @b", "username": wsa.account["username"], "from": {"id": wsa.ig_user_id, "username": wsa.account["username"]}},  # own account
        {"id": "1784", "text": "@a @b", "username": "cheater", "from": {"id": "932", "username": "cheater"}},  # excluded
    ]
    meta.media_comments[media] = comments
    r = await wsa.post("/giveaways", json={"account_id": wsa.account["id"], "name": "Diwali giveaway", "media_id": media, "min_mentions": 2,
                                           "exclude_usernames": ["@cheater"], "winners_count": 3})
    assert r.status_code == 201, r.text
    g = r.json()
    d = await wsa.post(f"/giveaways/{g['id']}/draw")
    assert d.status_code == 200, d.text
    d = d.json()
    assert d["status"] == "drawn" and d["comments_total"] == 64 and d["entries_count"] == 60 and len(d["winners"]) == 3
    assert len({w["username"] for w in d["winners"]}) == 3 and not {w["username"] for w in d["winners"]} & {"lazy", "cheater", wsa.account["username"]}

    n = await wsa.post(f"/giveaways/{g['id']}/notify", json={"message": "Congrats {{username}}! You won 🎉"})
    assert n.status_code == 200 and all(w["notified"] for w in n.json()["winners"])
    replies = [m for m in meta.sent if "comment_id" in m["recipient"]]
    assert len(replies) == 3 and replies[0]["message"]["text"].startswith("Congrats @user")


@pytest.mark.paid
async def test_giveaway_keyword_rule_no_entries_and_scoping(wsa, other, meta):
    meta.media_comments["18000000000000888"] = _comments(5, text="nice")
    g = (await wsa.post("/giveaways", json={"account_id": wsa.account["id"], "name": "Keyword", "media_id": "18000000000000888", "keyword": "WIN"})).json()
    r = await wsa.post(f"/giveaways/{g['id']}/draw")
    assert r.status_code == 409 and "No comments match" in r.json()["detail"]["error"]
    assert (await wsa.post(f"/giveaways/{g['id']}/notify", json={"message": "hi"})).status_code == 409
    for call in (other.post(f"/giveaways/{g['id']}/draw"), other.delete(f"/giveaways/{g['id']}")):
        assert (await call).status_code == 404
    assert (await other.get("/giveaways")).json() == []


# ---- A/B DM variants ----------------------------------------------------------------------------------------------------

async def test_ab_variants_split_people_and_report_clicks(wsa, meta, app_client):
    a = await _automation(wsa, dm_text_b="Variant B {{username}}")
    for i in range(10):
        await wsa.comment("price", from_=f"92000000010{i}", username=f"ab{i}", comment_id=f"17900000001000{i:02d}")
    bodies = [m["message"]["attachment"]["payload"]["text"] for m in meta.sent]
    assert any(b.startswith("Variant A") for b in bodies) and any(b.startswith("Variant B") for b in bodies)
    b_dm = next(m for m in meta.sent if m["message"]["attachment"]["payload"]["text"].startswith("Variant B"))
    await app_client.get(b_dm["message"]["attachment"]["payload"]["buttons"][0]["url"].replace("https://api.test", ""), follow_redirects=False)
    res = (await wsa.get(f"/comment-automations/{a['id']}/variants")).json()
    assert res["enabled"] and res["A"]["sent"] + res["B"]["sent"] == 10 and res["B"]["clicked"] == 1 and res["A"]["clicked"] == 0
    assert res["B"]["click_rate"] == round(100 / res["B"]["sent"], 1)
    assert json.dumps(res)  # serialisable
    assert texts(meta)  # DMs went out
