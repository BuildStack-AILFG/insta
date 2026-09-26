"""Auto-replies, custom replies, human takeover, the flow engine, delayed replies and the AI agent."""

from __future__ import annotations

import pytest
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import update

from app.services import scheduler
from app.services.ai import agent as ai_agent
from tests.conftest import db_session, texts


async def _conv_id(ws):
    return (await ws.get("/inbox/conversations")).json()["items"][0]["id"]


# ---- custom replies / auto replies ------------------------------------------------------------------------------------------------------

async def test_custom_reply_priority_exact_then_contains_then_any(wsa, meta):
    for body in ({"trigger": "hello", "match_type": "exact", "reply_text": "EXACT hello {{first_name}}"},
                 {"trigger": "price, cost", "match_type": "contains", "reply_text": "Our prices start at $10"},
                 {"trigger": "", "match_type": "any", "reply_text": "CATCH-ALL"}):
        assert (await wsa.post("/custom-replies", json=body)).status_code == 201

    await wsa.inbound("Hello", from_="909800000001", name="Ravi Kumar")
    await wsa.inbound("what is the COST of this?", from_="909800000002")
    await wsa.inbound("random question", from_="909800000003")
    assert texts(meta) == ["EXACT hello Ravi", "Our prices start at $10", "CATCH-ALL"]

    # disabling the master switch silences custom replies
    await wsa.patch("/settings", json={"settings": {"custom_replies_enabled": False}})
    meta.sent.clear()
    await wsa.inbound("price?", from_="909800000004")
    assert not meta.sent
    replies = (await wsa.get("/custom-replies")).json()
    assert sum(r["conversations_sent"] for r in replies) == 3


async def test_custom_reply_requires_trigger_and_content(wsa):
    assert (await wsa.post("/custom-replies", json={"trigger": "", "match_type": "contains", "reply_text": "x"})).status_code == 422
    assert (await wsa.post("/custom-replies", json={"trigger": "hi", "match_type": "exact", "reply_text": ""})).status_code == 422


async def test_welcome_message_only_once_and_away_message_outside_hours(wsa, meta):
    r = await wsa.patch("/settings", json={"settings": {"auto_replies": {"welcome": {"enabled": True, "message": "Welcome {{first_name}}!"}, "away": {"enabled": True, "message": "We're closed"}}}})
    assert r.status_code == 200, r.text
    # business hours: every day closed -> always "away"
    days = {d: {"enabled": False, "start": "09:00", "end": "18:00"} for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
    assert (await wsa.patch("/settings", json={"settings": {"business_hours": {"timezone": "Asia/Kolkata", "days": days}}})).status_code == 200

    await wsa.inbound("hi", name="Meera Shah")
    assert texts(meta) == ["Welcome Meera!", "We're closed"]
    await wsa.inbound("anyone there?")
    assert texts(meta) == ["Welcome Meera!", "We're closed"]  # neither repeats (away has a 12h cooldown)


async def test_away_message_respects_open_hours(wsa, meta):
    await wsa.patch("/settings", json={"settings": {"auto_replies": {"away": {"enabled": True, "message": "We're closed"}}}})
    days = {d: {"enabled": True, "start": "00:00", "end": "23:59"} for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
    await wsa.patch("/settings", json={"settings": {"business_hours": {"timezone": "UTC", "days": days}}})
    await wsa.inbound("hi")
    assert not meta.sent


async def test_human_reply_pauses_the_bot_until_resumed(wsa, meta):
    await wsa.post("/custom-replies", json={"trigger": "menu", "match_type": "contains", "reply_text": "Here is the menu"})
    await wsa.inbound("menu please")
    assert texts(meta) == ["Here is the menu"]
    cid = await _conv_id(wsa)
    await wsa.post(f"/inbox/conversations/{cid}/messages", json={"type": "text", "text": "Hi, this is Sam — how can I help?"})
    meta.sent.clear()
    await wsa.inbound("menu again")
    assert not meta.sent  # an agent owns the conversation: automation never talks over them
    await wsa.patch(f"/inbox/conversations/{cid}", json={"inbox_status": "bot"})
    await wsa.inbound("menu once more")
    assert texts(meta) == ["Here is the menu"]


async def test_opt_out_gets_a_confirmation(wsa, meta):
    await wsa.inbound("STOP")
    assert len(meta.sent) == 1 and "unsubscribed" in texts(meta)[0]


async def test_delayed_reply_sent_once_when_nobody_answers(wsa, meta):
    await wsa.patch("/settings", json={"settings": {"auto_replies": {"delayed": {"enabled": True, "message": "A teammate will be with you shortly", "minutes": 5}}}})
    await wsa.inbound("I need help")
    from app.models.conversation import Conversation
    cid = await _conv_id(wsa)
    await scheduler.tick()
    assert not meta.sent  # only seconds have passed
    async with await db_session() as db:
        await db.execute(update(Conversation).where(Conversation.id == cid).values(last_inbound_at=datetime.now(timezone.utc) - timedelta(minutes=10)))
        await db.commit()
    await scheduler.tick()
    await scheduler.tick()
    assert texts(meta) == ["A teammate will be with you shortly"]  # exactly once


@pytest.mark.paid
async def test_settings_are_validated_and_secrets_protected(wsa):
    assert (await wsa.patch("/settings", json={"settings": {"auto_replies": {"welcome": {"enabled": True, "message": "  "}}}})).status_code == 422
    assert (await wsa.patch("/settings", json={"settings": {"business_hours": {"timezone": "Mars/Base", "days": {}}}})).status_code == 422
    assert (await wsa.patch("/settings", json={"settings": {"assignment": {"mode": "chaos"}}})).status_code == 422
    assert (await wsa.patch("/settings", json={"settings": {"ai": {"api_key_enc": "x"}}})).status_code == 422
    assert (await wsa.patch("/settings", json={"settings": {"whatever": 1}})).status_code == 422
    ok = await wsa.patch("/settings", json={"settings": {"default_country_code": "+91", "quick_replies": [{"shortcut": "/thanks", "text": "Thanks for reaching out!"}]}})
    assert ok.status_code == 200 and ok.json()["settings"]["default_country_code"] == "91" and ok.json()["settings"]["quick_replies"][0]["shortcut"] == "thanks"


# ---- flows ---------------------------------------------------------------------------------------------------------------------------------

def _lead_flow():
    n = lambda id_, type_, **data: {"id": id_, "type": type_, "position": {"x": 0, "y": 0}, "data": data}  # noqa: E731
    e = lambda s, t, h=None: {"id": f"{s}-{t}-{h}", "source": s, "target": t, **({"sourceHandle": h} if h else {})}  # noqa: E731
    return {"nodes": [
        n("start", "start", trigger="keyword", keywords=["demo"], match="contains"),
        n("hello", "send_message", text="Great {{first_name}}! Let's book your demo."),
        n("ask_email", "ask_question", question="What's your work email?", key="email", validation="email", save_as="trait", max_retries=2, retry_message="That doesn't look like an email, try again."),
        n("plan", "send_buttons", body="Which plan interests you?", buttons=[{"id": "basic", "title": "Basic"}, {"id": "pro", "title": "Pro"}]),
        n("tag_basic", "add_tag", tag="plan-basic"),
        n("wait", "delay", amount=1, unit="minutes"),
        n("tag_pro", "add_tag", tag="plan-pro"),
        n("followup", "send_message", text="Following up on the Pro plan — want a call?"),
        n("bye", "end"),
    ], "edges": [e("start", "hello"), e("hello", "ask_email"), e("ask_email", "plan", "success"), e("plan", "tag_basic", "basic"), e("plan", "wait", "pro"),
                 e("tag_basic", "bye"), e("wait", "tag_pro"), e("tag_pro", "followup"), e("followup", "bye")]}


async def _publish(ws, name, trigger, graph):
    f = (await ws.post("/flows", json={"name": name, "trigger_type": trigger, "graph": graph})).json()
    r = await ws.post(f"/flows/{f['id']}/publish")
    assert r.status_code == 200, r.text
    return f["id"]


async def test_flow_publish_validation_reports_real_problems(wsa):
    n = lambda id_, type_, **data: {"id": id_, "type": type_, "position": {"x": 0, "y": 0}, "data": data}  # noqa: E731
    bad = {"nodes": [n("start", "start", trigger="incoming_message"), n("a", "send_message", text=""), n("orphan", "send_message", text="lonely"),
                     n("c", "condition", rules=[{"left": "tag", "op": "eq", "right": "vip"}]), n("loop1", "send_message", text="x"), n("loop2", "send_message", text="y")],
           "edges": [{"id": "1", "source": "start", "target": "a"}, {"id": "2", "source": "a", "target": "c"}, {"id": "3", "source": "c", "target": "loop1", "sourceHandle": "true"},
                     {"id": "4", "source": "loop1", "target": "loop2"}, {"id": "5", "source": "loop2", "target": "loop1"}]}
    f = (await wsa.post("/flows", json={"name": "bad", "graph": bad})).json()
    r = await wsa.post(f"/flows/{f['id']}/publish")
    assert r.status_code == 422
    problems = " | ".join(r.json()["detail"]["problems"])
    assert "message text is empty" in problems and "not connected to the Start" in problems and "Yes and No" in problems and "never waits" in problems
    assert (await wsa.get(f"/flows/{f['id']}")).json()["status"] == "draft"


async def test_lead_qualification_flow_end_to_end(wsa, meta):
    fid = await _publish(wsa, "Book a demo", "keyword", _lead_flow())
    await wsa.inbound("I'd like a DEMO please", name="Priya Nair")
    assert texts(meta) == ["Great Priya! Let's book your demo.", "What's your work email?"]

    await wsa.inbound("not an email")
    assert texts(meta)[-1] == "That doesn't look like an email, try again."
    await wsa.inbound("priya@acme.io")
    assert texts(meta)[-1] == "Which plan interests you?"
    assert [q["title"] for q in meta.sent[-1]["message"]["quick_replies"]] == ["Basic", "Pro"]  # buttons become quick replies
    contact = (await wsa.get("/contacts")).json()["items"][0]
    assert contact["traits"]["email"] == "priya@acme.io"  # the validated answer was saved to the contact

    await wsa.inbound("Pro", extra={"text": "Pro", "quick_reply": {"payload": "pro"}})
    ex = (await wsa.get(f"/flows/{fid}/executions")).json()[0]
    assert ex["status"] == "waiting" and ex["wait_until"]  # parked on the 1-minute delay

    from app.models.automation_execution import AutomationExecution
    async with await db_session() as db:
        await db.execute(update(AutomationExecution).where(AutomationExecution.id == ex["id"]).values(wait_until=datetime.now(timezone.utc) - timedelta(seconds=1)))
        await db.commit()
    assert (await scheduler.tick())["flows"] == 1
    assert texts(meta)[-1] == "Following up on the Pro plan — want a call?"
    detail = (await wsa.get(f"/flows/{fid}/executions/{ex['id']}")).json()
    assert detail["status"] == "completed" and detail["context"]["email"] == "priya@acme.io"
    assert [ev["type"] for ev in detail["events"]][:3] == ["started", "sent", "waiting_reply"]
    assert "plan-pro" in (await wsa.get("/contacts")).json()["items"][0]["tags"]
    assert (await wsa.get("/flows")).json()[0]["conversations_sent"] == 1


async def test_flow_validation_failures_hand_over_to_a_human(wsa, meta):
    fid = await _publish(wsa, "Book a demo", "keyword", _lead_flow())
    await wsa.inbound("demo")
    await wsa.inbound("nope")
    await wsa.inbound("still nope")  # max_retries=2 and no 'failed' branch -> hand off
    conv = (await wsa.get("/inbox/conversations")).json()["items"][0]
    assert conv["inbox_status"] == "intervened" and "needs-human" in conv["labels"]
    assert (await wsa.get(f"/flows/{fid}/executions")).json()[0]["status"] == "completed"


async def test_flow_condition_and_webhook_and_manual_run(wsa, meta, monkeypatch):
    import httpx
    from app.services.automation import flow_engine
    calls = []

    class FakeHTTP:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): ...
        async def request(self, method, url, **kw):
            calls.append((method, url, kw.get("json")))
            return httpx.Response(200, json={"discount": "VIP20"})
    monkeypatch.setattr(flow_engine.httpx, "AsyncClient", FakeHTTP)
    monkeypatch.setattr(flow_engine, "assert_public_url", lambda u: None)

    n = lambda id_, type_, **data: {"id": id_, "type": type_, "position": {"x": 0, "y": 0}, "data": data}  # noqa: E731
    g = {"nodes": [n("start", "start", trigger="manual"), n("hook", "webhook", url="https://crm.example.com/lead", method="POST"),
                   n("cond", "condition", rules=[{"left": "tag", "op": "eq", "right": "vip"}], match="all"),
                   n("yes", "send_message", text="VIP code: {{var.discount}}"), n("no", "send_message", text="Standard offer"), n("end", "end")],
         "edges": [{"id": "1", "source": "start", "target": "hook"}, {"id": "2", "source": "hook", "target": "cond"}, {"id": "3", "source": "cond", "target": "yes", "sourceHandle": "true"},
                   {"id": "4", "source": "cond", "target": "no", "sourceHandle": "false"}, {"id": "5", "source": "yes", "target": "end"}, {"id": "6", "source": "no", "target": "end"}]}
    fid = await _publish(wsa, "Manual", "manual", g)
    await wsa.inbound("hello", from_="900000000009", username="vip.buyer")  # opens the 24h messaging window
    contact = (await wsa.get("/contacts")).json()["items"][0]
    await wsa.patch(f"/contacts/{contact['id']}", json={"tags": ["vip"]})
    meta.sent.clear()
    r = await wsa.post(f"/flows/{fid}/run", json={"contact_id": contact["id"]})
    assert r.status_code == 200 and r.json()["status"] == "completed", r.text
    assert texts(meta) == ["VIP code: VIP20"] and calls[0][1] == "https://crm.example.com/lead" and calls[0][2]["contact"]["username"] == "vip.buyer"


async def test_unpublish_cancels_running_executions(wsa, meta):
    fid = await _publish(wsa, "Book a demo", "keyword", _lead_flow())
    await wsa.inbound("demo")
    assert (await wsa.get(f"/flows/{fid}/executions")).json()[0]["status"] == "waiting"
    await wsa.post(f"/flows/{fid}/unpublish")
    assert (await wsa.get(f"/flows/{fid}/executions")).json()[0]["status"] == "cancelled"
    meta.sent.clear()
    await wsa.inbound("demo again", mid="aWdfD2")
    assert not meta.sent  # an unpublished flow no longer fires


async def test_flows_are_tenant_scoped(wsa, other):
    fid = await _publish(wsa, "Mine", "incoming_message", {"nodes": [{"id": "start", "type": "start", "data": {}, "position": {"x": 0, "y": 0}}, {"id": "m", "type": "send_message", "data": {"text": "x"}, "position": {"x": 0, "y": 0}}],
                                                             "edges": [{"id": "e", "source": "start", "target": "m"}]})
    for call in (other.get(f"/flows/{fid}"), other.put(f"/flows/{fid}", json={"name": "hax"}), other.post(f"/flows/{fid}/publish"), other.delete(f"/flows/{fid}")):
        assert (await call).status_code == 404


# ---- AI agent ------------------------------------------------------------------------------------------------------------------------------

def fake_llm(monkeypatch, reply="Delivery takes 2-3 days.", handoff=False, confidence=0.9, collected=None, capture=None):
    async def complete(api_key, *, system, messages, model=None, max_tokens=700):
        if capture is not None:
            capture.update(system=system, messages=messages, key=api_key)
        return json.dumps({"reply": reply, "handoff": handoff, "confidence": confidence, "collected": collected or {}})
    monkeypatch.setattr(ai_agent, "complete", complete)


async def _enable_ai(ws, **extra):
    r = await ws.put("/ai/config", json={"enabled": True, "agent_type": "support", "api_key": "sk-ant-test-key-123456", **extra})
    assert r.status_code == 200, r.text
    return r.json()


async def test_ai_cannot_be_enabled_without_a_key_and_never_leaks_it(wsa):
    r = await wsa.put("/ai/config", json={"enabled": True})
    assert r.status_code == 422 and "API key" in r.json()["detail"]["error"]
    cfg = await _enable_ai(wsa)
    assert cfg["has_own_key"] and cfg["api_key_hint"].endswith("3456") and "sk-ant" not in json.dumps(cfg)
    assert "sk-ant" not in json.dumps((await wsa.get("/settings")).json())  # not exposed through settings either
    kept = await wsa.put("/ai/config", json={"enabled": True, "tone": "warm"})  # omitting api_key keeps the stored one
    assert kept.status_code == 200 and kept.json()["has_own_key"]


async def test_ai_answers_from_knowledge_base_and_grounds_the_prompt(wsa, meta, monkeypatch):
    await _enable_ai(wsa, business_name="Acme Bikes", instructions="Never promise discounts.")
    r = await wsa.post("/ai/knowledge/faq", json={"items": [{"question": "How long does delivery take?", "answer": "Delivery takes 2-3 working days across India."},
                                                            {"question": "Do you offer EMI?", "answer": "Yes, EMI is available on orders above 5000 rupees."}]})
    assert r.status_code == 201 and r.json()["chunk_count"] == 2
    await wsa.post("/ai/knowledge/text", json={"title": "Returns", "content": "Returns are accepted within 7 days of delivery if the product is unused."})

    seen: dict = {}
    fake_llm(monkeypatch, capture=seen)
    await wsa.inbound("How long is the delivery time?")
    assert texts(meta) == ["Delivery takes 2-3 days."]
    assert "Delivery takes 2-3 working days" in seen["system"] and "Acme Bikes" in seen["system"] and "Never promise discounts" in seen["system"]
    assert "EMI is available" not in seen["system"]  # unrelated knowledge isn't stuffed into the prompt
    assert seen["system"].index("Delivery takes 2-3 working days") < seen["system"].index("Returns are accepted")  # best match ranks first
    assert seen["key"] == "sk-ant-test-key-123456" and seen["messages"][-1] == {"role": "user", "content": "How long is the delivery time?"}
    assert (await wsa.get("/inbox/conversations")).json()["items"][0]["inbox_status"] == "bot"
    assert (await wsa.get("/ai/config")).json()["usage_this_month"] == 1


async def test_ai_handoff_on_keyword_and_on_low_confidence(wsa, meta, monkeypatch):
    await _enable_ai(wsa, handoff_message="Connecting you to a human.", min_confidence=0.5)
    fake_llm(monkeypatch)
    await wsa.inbound("I want to talk to a human agent", from_="900000000011", username="ai.user11")
    assert texts(meta) == ["Connecting you to a human."]  # keyword handoff never even calls the model
    assert next(c for c in (await wsa.get("/inbox/conversations")).json()["items"] if c["contact"]["username"] == "ai.user11")["inbox_status"] == "intervened"

    meta.sent.clear()
    fake_llm(monkeypatch, reply="Maybe?", confidence=0.2)
    await wsa.inbound("what's the warranty on tyres?", from_="900000000012", username="ai.user12")
    assert texts(meta) == ["Connecting you to a human."]
    assert next(c for c in (await wsa.get("/inbox/conversations")).json()["items"] if c["contact"]["username"] == "ai.user12")["inbox_status"] == "intervened"

    meta.sent.clear()
    await wsa.inbound("still there?", from_="900000000012", username="ai.user12", mid="aWdfAI3")
    assert not meta.sent  # a human took over -> the AI stays quiet


async def test_ai_lead_qualification_saves_collected_fields(wsa, meta, monkeypatch):
    await _enable_ai(wsa, agent_type="leads", qualification_fields=["budget", "timeline"])
    fake_llm(monkeypatch, reply="Great, and when do you want to start?", collected={"budget": "50k", "junk": "ignored"})
    await wsa.inbound("I'm interested in your service")
    traits = (await wsa.get("/contacts")).json()["items"][0]["traits"]
    assert traits == {"budget": "50k"}  # only declared qualification fields are stored


async def test_ai_quota_enforced_on_platform_key_but_not_byo_key(wsa, meta, monkeypatch):
    from app.core.config import get_settings
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "platform-key")
    cfg = await wsa.put("/ai/config", json={"enabled": True})  # trial plan, platform key, no BYO
    assert cfg.status_code == 200
    from app.models.tenant import Tenant
    async with await db_session() as db:
        t = await db.get(Tenant, wsa.tenant_id)
        t.quotas_override = {"ai_replies_included_per_month": 1}
        await db.commit()
    fake_llm(monkeypatch)
    await wsa.inbound("q1", from_="909800000021")
    await wsa.inbound("q2", from_="909800000022")
    assert len(meta.sent) == 1  # the included allowance ran out; second message got no AI reply (and no error)
    n = (await wsa.get("/notifications")).json()["items"]
    assert any("AI replies" in i["title"] for i in n)


async def test_ai_playground_and_knowledge_url_ingest(wsa, meta, monkeypatch):
    await _enable_ai(wsa)
    fake_llm(monkeypatch, reply="We open at 9am.")
    r = await wsa.post("/ai/test", json={"question": "When do you open?"})
    assert r.status_code == 200 and r.json()["reply"] == "We open at 9am."
    assert not meta.sent  # the playground never touches Instagram

    from app.services.ai import knowledge
    import httpx as _httpx
    html = "<html><head><title>About Acme</title></head><body><nav>menu</nav><p>Acme sells bikes and offers free servicing for one year.</p><script>bad()</script></body></html>"

    class FakeHTTP:
        def __init__(self, *a, **k): ...
        async def __aenter__(self): return self
        async def __aexit__(self, *a): ...
        async def get(self, url):
            return _httpx.Response(200, text=html, headers={"content-type": "text/html"})
    monkeypatch.setattr(knowledge.httpx, "AsyncClient", FakeHTTP)
    monkeypatch.setattr(knowledge, "assert_public_url", lambda u: None)
    src = (await wsa.post("/ai/knowledge/url", json={"url": "https://acme.example.com/about", "crawl": False})).json()
    assert src["status"] == "ready" and src["title"] == "About Acme" and src["chunk_count"] == 1
    chunk = (await wsa.get(f"/ai/knowledge/{src['id']}/chunks")).json()[0]
    assert "free servicing" in chunk and "bad()" not in chunk and "menu" not in chunk  # scripts/nav stripped


async def test_ai_url_ingest_blocks_internal_addresses(wsa):
    r = await wsa.post("/ai/knowledge/url", json={"url": "http://169.254.169.254/latest/meta-data/"})
    assert r.status_code == 201 and r.json()["status"] == "failed" and "private" in r.json()["error"].lower() or "https" in r.json()["error"].lower()
