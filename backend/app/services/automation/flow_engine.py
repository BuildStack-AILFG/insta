"""
Flow (workflow) engine. A flow is a graph {nodes:[{id,type,data,position}], edges:[{id,source,target,sourceHandle}]}
authored in the UI and executed here from its *published snapshot*.

Waiting: `ask_question`, `send_buttons`, `send_list` wait for the contact's next reply; `delay` waits for time.
On Instagram, buttons and list rows are sent as quick replies (up to 13 tappable options under the message). State lives in
`automation_executions`, so a restart loses nothing. The scheduler resumes timed waits; the inbound dispatcher resumes reply waits.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.net import UnsafeUrl, assert_public_url
from app.models.automation_execution import AutomationExecution
from app.models.automation_flow import AutomationFlow
from app.models.contact import Contact
from app.models.conversation import Conversation, Message
from app.models.instagram_account import InstagramAccount
from app.models.tenant import Tenant, TenantMembership
from app.services import assignment, outbound_webhooks, pipeline, templating
from app.services.ai import agent as ai_agent
from app.services.phone import InvalidPhone, normalize_phone
from app.services.instagram import links as ig_links
from app.services.instagram import messaging

log = logging.getLogger(__name__)

MAX_STEPS = 60
MAX_EVENTS = 200
WAIT_NODES = {"ask_question", "send_buttons", "send_list", "delay"}
NODE_TYPES = {
    "start", "send_message", "send_media", "send_link_buttons", "send_buttons", "send_list", "ask_question", "condition", "delay",
    "add_tag", "remove_tag", "set_trait", "assign_agent", "webhook", "ai_reply", "handoff", "end",
    "create_deal", "move_deal", "send_payment_link",
}
TRIGGERS = {"incoming_message", "keyword", "contact_created", "story_reply", "manual", "webhook", "event"}
MAX_OPTIONS = messaging.MAX_QUICK_REPLIES
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
DATE_FORMATS = ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y", "%m/%d/%Y")
UNITS = {"minutes": 60, "hours": 3600, "days": 86400}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---- graph helpers & validation ---------------------------------------------------------------------------------

def _nodes(graph: dict) -> dict[str, dict]:
    return {n["id"]: n for n in (graph or {}).get("nodes", [])}


def _edges_from(graph: dict, node_id: str) -> list[dict]:
    return [e for e in (graph or {}).get("edges", []) if e.get("source") == node_id]


def next_node(graph: dict, node_id: str, handle: str | None = None) -> str | None:
    """Follow the edge leaving `node_id` via `handle` (None/'next' = the default output)."""
    for e in _edges_from(graph, node_id):
        h = e.get("sourceHandle")
        if (handle in (None, "next") and h in (None, "next", "out")) or (handle not in (None, "next") and h == handle):
            return e.get("target")
    return None


def validate_graph(graph: dict) -> list[str]:
    """Publish-time validation. Returns human-readable errors (empty = valid)."""
    errors: list[str] = []
    nodes = _nodes(graph)
    edges = (graph or {}).get("edges", [])
    starts = [n for n in nodes.values() if n.get("type") == "start"]
    if len(starts) != 1:
        return ["A flow needs exactly one Start node."]
    for n in nodes.values():
        if n.get("type") not in NODE_TYPES:
            errors.append(f"Unknown step type '{n.get('type')}'.")
    if errors:
        return errors

    seen_handles: set[tuple[str, str]] = set()
    for e in edges:
        if e.get("source") not in nodes or e.get("target") not in nodes:
            errors.append("A connection points to a step that no longer exists.")
            continue
        key = (e["source"], e.get("sourceHandle") or "next")
        if key in seen_handles:
            errors.append(f"'{_label(nodes[e['source']])}' has more than one connection from the same output.")
        seen_handles.add(key)

    # reachability
    reachable: set[str] = set()
    stack = [starts[0]["id"]]
    while stack:
        nid = stack.pop()
        if nid in reachable:
            continue
        reachable.add(nid)
        stack.extend(e["target"] for e in _edges_from(graph, nid) if e.get("target") in nodes)
    for nid, n in nodes.items():
        if nid not in reachable:
            errors.append(f"'{_label(n)}' is not connected to the Start node.")

    if not _edges_from(graph, starts[0]["id"]):
        errors.append("Connect the Start node to your first step.")

    for nid, n in nodes.items():
        d, t = n.get("data") or {}, n.get("type")
        name = _label(n)
        if t == "send_message" and not (d.get("text") or "").strip():
            errors.append(f"'{name}': message text is empty.")
        elif t == "send_media" and not (d.get("url") or "").startswith(("http://", "https://")):
            errors.append(f"'{name}': a public media URL is required.")
        elif t == "send_buttons":
            btns = d.get("buttons") or []
            if not (d.get("body") or "").strip() or not 1 <= len(btns) <= MAX_OPTIONS:
                errors.append(f"'{name}': needs body text and 1-{MAX_OPTIONS} buttons.")
            ids = [b.get("id") for b in btns]
            if len(set(ids)) != len(ids) or any(not (b.get("title") or "").strip() or len(b["title"]) > 20 for b in btns):
                errors.append(f"'{name}': button ids must be unique and titles 1-20 characters.")
        elif t == "send_list":
            rows = [r for s in (d.get("sections") or []) for r in s.get("rows", [])]
            if not (d.get("body") or "").strip() or not 1 <= len(rows) <= MAX_OPTIONS:
                errors.append(f"'{name}': needs body text and 1-{MAX_OPTIONS} options.")
        elif t == "send_link_buttons":
            links = d.get("buttons") or []
            if not (d.get("body") or "").strip() or not 1 <= len(links) <= 3:
                errors.append(f"'{name}': needs body text and 1-3 link buttons.")
            elif any(not (b.get("title") or "").strip() or len(b["title"]) > 20 or not str(b.get("url") or "").startswith(("http://", "https://")) for b in links):
                errors.append(f"'{name}': every link button needs a title (max 20 characters) and a web address.")
        elif t == "ask_question":
            if not (d.get("question") or "").strip() or not (d.get("key") or "").strip():
                errors.append(f"'{name}': needs a question and a field name to save the answer.")
            if d.get("validation") == "choice" and not d.get("options"):
                errors.append(f"'{name}': add the allowed choices.")
        elif t == "condition":
            if not d.get("rules"):
                errors.append(f"'{name}': add at least one condition.")
            handles = {e.get("sourceHandle") for e in _edges_from(graph, nid)}
            if not {"true", "false"} <= handles:
                errors.append(f"'{name}': connect both the Yes and No branches.")
        elif t == "delay":
            try:
                ok = float(d.get("amount", 0)) > 0 and d.get("unit", "minutes") in UNITS
            except (TypeError, ValueError):
                ok = False
            if not ok:
                errors.append(f"'{name}': set a wait time greater than zero.")
        elif t in {"add_tag", "remove_tag"} and not (d.get("tag") or "").strip():
            errors.append(f"'{name}': tag name is required.")
        elif t == "set_trait" and not (d.get("key") or "").strip():
            errors.append(f"'{name}': field name is required.")
        elif t == "webhook" and not (d.get("url") or "").startswith(("http://", "https://")):
            errors.append(f"'{name}': a valid URL is required.")
        elif t == "create_deal" and not (d.get("title") or "").strip():
            errors.append(f"'{name}': give the deal a title.")
        elif t == "move_deal" and not d.get("stage_id"):
            errors.append(f"'{name}': choose the stage to move the deal to.")
        elif t == "send_payment_link":
            try:
                ok = float(d.get("amount", 0)) >= 1
            except (TypeError, ValueError):
                ok = False
            if not ok:
                errors.append(f"'{name}': set an amount of at least 1.")

    # a loop is fine only if a wait sits inside it — otherwise it would spin
    def has_busy_cycle() -> bool:
        color: dict[str, int] = {}

        def dfs(nid: str) -> bool:
            color[nid] = 1
            for e in _edges_from(graph, nid):
                nxt = e.get("target")
                if nxt not in nodes or nodes[nxt].get("type") in WAIT_NODES:
                    continue
                if color.get(nxt) == 1 or (color.get(nxt) is None and dfs(nxt)):
                    return True
            color[nid] = 2
            return False

        return any(color.get(nid) is None and n.get("type") not in WAIT_NODES and dfs(nid) for nid, n in nodes.items())

    if has_busy_cycle():
        errors.append("A loop in this flow never waits for the contact — add a question or delay inside the loop.")
    return errors


def _label(node: dict) -> str:
    return (node.get("data") or {}).get("label") or node.get("type", "step").replace("_", " ").title()


# ---- execution ------------------------------------------------------------------------------------------------------

def _log(ex: AutomationExecution, node_id: str | None, kind: str, detail: str = "") -> None:
    ex.events = [*(ex.events or [])[-(MAX_EVENTS - 1):], {"at": utcnow().isoformat(), "node": node_id, "type": kind, "detail": detail[:300]}]
    flag_modified(ex, "events")


async def start_flow(db: AsyncSession, flow: AutomationFlow, contact: Contact, conv: Conversation | None, *, context: dict | None = None,
                     allow_parallel: bool = False) -> AutomationExecution | None:
    """Begin executing a published flow for a contact. Returns None if it was skipped (unpublished, already running)."""
    graph = flow.published_snapshot
    if flow.status != "published" or not graph:
        return None
    if not allow_parallel:
        active = (await db.execute(select(AutomationExecution.id).where(
            AutomationExecution.flow_id == flow.id, AutomationExecution.contact_id == contact.id, AutomationExecution.status.in_(("running", "waiting"))
        ))).first()
        if active:
            return None
    start = next((n for n in graph.get("nodes", []) if n.get("type") == "start"), None)
    if start is None:
        return None
    ex = AutomationExecution(tenant_id=flow.tenant_id, flow_id=flow.id, contact_id=contact.id, conversation_id=conv.id if conv else None,
                             status="running", current_node=start["id"], context=dict(context or {}), events=[])
    db.add(ex)
    flow.conversations_sent = (flow.conversations_sent or 0) + 1
    _log(ex, start["id"], "started", flow.name)
    await db.flush()
    await _run(db, ex, graph, next_node(graph, start["id"]))
    return ex


def _options(node: dict) -> list[dict]:
    """Buttons / list rows of a node as quick replies: [{title, payload}] where payload is the option id (= the output handle)."""
    d = node.get("data") or {}
    raw = d.get("buttons") if node["type"] == "send_buttons" else [row for s in d.get("sections") or [] for row in s.get("rows", [])]
    return [{"title": str(o.get("title") or "")[:20], "payload": str(o.get("id"))} for o in (raw or [])[:MAX_OPTIONS] if o.get("id") and o.get("title")]


async def _load_ctx(db: AsyncSession, ex: AutomationExecution) -> tuple[Tenant, Contact, Conversation | None, InstagramAccount | None]:
    tenant = await db.get(Tenant, ex.tenant_id)
    contact = await db.get(Contact, ex.contact_id)
    conv = await db.get(Conversation, ex.conversation_id) if ex.conversation_id else None
    account = await db.get(InstagramAccount, conv.account_id) if conv else None
    if account is None:  # no conversation yet (e.g. started from an API event) — use the workspace's connected account
        account = (await db.execute(select(InstagramAccount).where(InstagramAccount.tenant_id == ex.tenant_id, InstagramAccount.status != "disconnected").limit(1))).scalar_one_or_none()
        if account and contact and contact.ig_user_id:
            conv, _ = await messaging.get_or_create_conversation(db, account, contact)
            ex.conversation_id = conv.id
    return tenant, contact, conv, account


async def _run(db: AsyncSession, ex: AutomationExecution, graph: dict, node_id: str | None) -> None:
    tenant, contact, conv, account = await _load_ctx(db, ex)
    nodes = _nodes(graph)
    steps = 0
    try:
        while node_id and steps < MAX_STEPS:
            steps += 1
            node = nodes.get(node_id)
            if node is None:
                break
            ex.current_node = node_id
            outcome = await _exec_node(db, ex, graph, node, tenant, contact, conv, account)
            if outcome[0] == "wait":
                await db.commit()
                return
            if outcome[0] == "end":
                node_id = None
                break
            node_id = next_node(graph, node_id, outcome[1])
        if steps >= MAX_STEPS and node_id:
            ex.status, ex.error = "failed", "Stopped: too many steps without waiting (possible loop)."
            _log(ex, node_id, "error", ex.error)
        else:
            ex.status, ex.waiting_for, ex.wait_until = "completed", None, None
            _log(ex, ex.current_node, "completed")
            await outbound_webhooks.emit(ex.tenant_id, "flow_completed", {"flow_id": str(ex.flow_id), "contact_id": str(ex.contact_id)})
    except Exception as exc:  # noqa: BLE001 — a broken step must fail the run, never the webhook
        log.exception("flow execution %s crashed", ex.id)
        ex.status, ex.error = "failed", str(exc)[:500]
        _log(ex, ex.current_node, "error", str(exc))
    await db.commit()


async def _send(db, ex, node, account, conv, contact, **kwargs) -> Message | None:
    """Send from a flow. A blocked/failed send is recorded on the run and the flow continues."""
    if account is None or conv is None:
        _log(ex, node["id"], "skipped", "No Instagram account connected, or this contact has never messaged it.")
        return None
    try:
        return await messaging.send_message(db, account, conv, contact, sender_type="flow", strict=False, **kwargs)
    except messaging.SendBlocked as exc:
        _log(ex, node["id"], "blocked", exc.message)
    return None


async def _exec_node(db, ex, graph, node, tenant, contact, conv, account) -> tuple[str, str | None]:
    t, d, nid = node["type"], node.get("data") or {}, node["id"]
    ctx = ex.context or {}
    r = lambda s: templating.render(s, contact, ctx)  # noqa: E731 — tiny local alias for readability

    if t == "send_message":
        m = await _send(db, ex, node, account, conv, contact, kind="text", text=r(d.get("text")))
        _log(ex, nid, "sent" if m else "not_sent", (d.get("text") or "")[:80])
        return "next", None

    if t == "send_media":
        kind = {"document": "file"}.get(d.get("media_type"), d.get("media_type"))
        kind = kind if kind in {"image", "video", "audio", "file"} else "image"
        m = await _send(db, ex, node, account, conv, contact, kind=kind, media_url=d.get("url"), media_filename=d.get("filename"))
        if m is not None and (d.get("caption") or "").strip():  # Instagram attachments have no caption — follow up with the text
            await _send(db, ex, node, account, conv, contact, kind="text", text=r(d.get("caption")))
        _log(ex, nid, "sent" if m else "not_sent", d.get("url", ""))
        return "next", None

    if t == "send_link_buttons":
        links = [{"title": b.get("title"), "url": r(b.get("url"))} for b in d.get("buttons") or []]
        if d.get("track_clicks", True):
            links = await ig_links.track_buttons(db, contact.tenant_id, links, source="flow", contact_id=contact.id, flow_id=ex.flow_id)
        m = await _send(db, ex, node, account, conv, contact, kind="buttons", text=r(d.get("body")), buttons=links)
        _log(ex, nid, "sent" if m else "not_sent", (d.get("body") or "")[:80])
        return "next", None

    if t in {"send_buttons", "send_list"}:
        m = await _send(db, ex, node, account, conv, contact, kind="text", text=r(d.get("body")), options=_options(node))
        if m is None or m.status == "failed":
            _log(ex, nid, "not_sent", "options message could not be sent")
            return "next", "default"
        ex.status, ex.waiting_for, ex.wait_until = "waiting", "reply", None
        _log(ex, nid, "waiting_reply")
        return "wait", None

    if t == "ask_question":
        prompt = r(d.get("question"))
        if d.get("validation") == "choice" and d.get("options"):
            prompt += "\n" + "\n".join(f"• {o}" for o in d["options"])
        m = await _send(db, ex, node, account, conv, contact, kind="text", text=prompt)
        if m is None or m.status == "failed":
            return "next", "failed"
        ex.status, ex.waiting_for, ex.wait_until = "waiting", "reply", None
        _log(ex, nid, "waiting_reply", d.get("key", ""))
        return "wait", None

    if t == "condition":
        matched = _evaluate(d, contact, ctx, conv, await _last_inbound(db, conv))
        _log(ex, nid, "condition", "yes" if matched else "no")
        return "next", "true" if matched else "false"

    if t == "delay":
        seconds = float(d.get("amount", 0)) * UNITS.get(d.get("unit", "minutes"), 60)
        ex.status, ex.waiting_for, ex.wait_until = "waiting", "time", utcnow() + timedelta(seconds=seconds)
        _log(ex, nid, "waiting_time", f"{d.get('amount')} {d.get('unit', 'minutes')}")
        return "wait", None

    if t in {"add_tag", "remove_tag"}:
        tag = r(d.get("tag")).strip()
        tags = list(contact.tags or [])
        if t == "add_tag" and tag not in tags:
            tags.append(tag)
        elif t == "remove_tag":
            tags = [x for x in tags if x != tag]
        contact.tags = tags
        _log(ex, nid, t, tag)
        return "next", None

    if t == "set_trait":
        contact.custom_fields = {**(contact.custom_fields or {}), d["key"]: r(d.get("value"))}
        _log(ex, nid, "set_trait", d["key"])
        return "next", None

    if t == "assign_agent":
        if conv is not None:
            user_id = d.get("user_id")
            if user_id:
                ok = (await db.execute(select(TenantMembership.id).where(TenantMembership.tenant_id == tenant.id, TenantMembership.user_id == uuid.UUID(str(user_id))))).first()
                if ok:
                    conv.assigned_user_id = uuid.UUID(str(user_id))
            else:
                await assignment.assign_new(db, tenant, conv)
            _log(ex, nid, "assigned", str(conv.assigned_user_id or "nobody"))
        return "next", None

    if t == "webhook":
        return await _call_webhook(ex, node, d, contact, ctx)

    if t == "create_deal":
        try:
            value = int(round(float(d.get("value") or 0) * 100))
            stage_id = uuid.UUID(str(d["stage_id"])) if d.get("stage_id") else None
            if d.get("only_if_none", True) and await pipeline.deal_for_contact(db, tenant.id, contact.id):
                _log(ex, nid, "skipped", "contact already has an open deal")
                return "next", None
            deal = await pipeline.create_deal(db, tenant.id, title=r(d.get("title")) or contact.name, stage_id=stage_id, contact_id=contact.id, value=max(value, 0), source="flow")
            _log(ex, nid, "deal_created", deal.title[:80])
        except (pipeline.PipelineError, ValueError, TypeError) as exc:
            _log(ex, nid, "skipped", getattr(exc, "message", str(exc)))
        return "next", None

    if t == "move_deal":
        try:
            deal = await pipeline.deal_for_contact(db, tenant.id, contact.id)
            if deal is None:
                _log(ex, nid, "skipped", "contact has no open deal")
            else:
                await pipeline.move_deal(db, deal, uuid.UUID(str(d["stage_id"])), user_id=None)
                _log(ex, nid, "deal_moved", deal.title[:80])
        except (pipeline.PipelineError, ValueError, KeyError) as exc:
            _log(ex, nid, "skipped", getattr(exc, "message", str(exc)))
        return "next", None

    if t == "send_payment_link":
        from app.services import payment_links  # local: payment_links -> events -> flow_engine
        try:
            deal = await pipeline.deal_for_contact(db, tenant.id, contact.id)
            link = await payment_links.create(db, tenant.id, None, amount=int(round(float(d.get("amount") or 0) * 100)), currency=str(d.get("currency") or "INR"),
                                              description=r(d.get("description")) or "Payment", contact_id=contact.id, deal_id=deal.id if deal else None)
        except (payment_links.LinkError, ValueError, TypeError) as exc:
            _log(ex, nid, "skipped", getattr(exc, "message", str(exc)))
            return "next", None
        text = r((d.get("message") or "Here's your secure payment link: {{link}}").replace("{{link}}", link.short_url))
        m = await _send(db, ex, node, account, conv, contact, kind="text", text=text)
        _log(ex, nid, "sent" if m else "not_sent", link.short_url)
        return "next", None

    if t == "ai_reply":
        question = await _last_inbound(db, conv) or ""
        try:
            res = await ai_agent.answer(db, tenant, conv, contact, question, extra_instructions=d.get("instructions") or "")
        except ai_agent.AIUnavailable as exc:
            _log(ex, nid, "skipped", str(exc))
            return "next", None
        await _send(db, ex, node, account, conv, contact, kind="text", text=res.reply)
        if res.handoff:
            return await _handoff(db, ex, node, tenant, conv, None)
        _log(ex, nid, "ai_reply")
        return "next", None

    if t == "handoff":
        return await _handoff(db, ex, node, tenant, conv, (r(d.get("message")) or None), account, contact)

    return "end", None  # 'end' (and defensively, anything else)


async def _handoff(db, ex, node, tenant, conv, message, account=None, contact=None) -> tuple[str, str | None]:
    if conv is not None:
        conv.inbox_status = "intervened"
        conv.labels = sorted({*(conv.labels or []), "needs-human"})
        await assignment.assign_new(db, tenant, conv)
        if message and account is not None and contact is not None:
            await _send(db, ex, node, account, conv, contact, kind="text", text=message)
    _log(ex, node["id"], "handoff")
    return "end", None


async def _last_inbound(db: AsyncSession, conv: Conversation | None) -> str | None:
    if conv is None:
        return None
    row = (await db.execute(select(Message.body).where(Message.conversation_id == conv.id, Message.direction == "in", Message.body.is_not(None)).order_by(Message.created_at.desc()).limit(1))).first()
    return row[0] if row else None


async def _call_webhook(ex, node, d, contact, ctx) -> tuple[str, str | None]:
    nid = node["id"]
    try:
        assert_public_url(d["url"])
        method = (d.get("method") or "POST").upper()
        body = {"contact": {"id": str(contact.id), "name": contact.name, "username": contact.ig_username, "phone": contact.phone, "email": contact.email, "tags": contact.tags, "traits": contact.custom_fields}, "variables": ctx}
        async with httpx.AsyncClient(timeout=8, follow_redirects=False) as http:
            resp = await http.request(method if method in {"GET", "POST", "PUT", "PATCH"} else "POST", d["url"], json=body if method != "GET" else None, headers=d.get("headers") or {})
        _log(ex, nid, "webhook", f"HTTP {resp.status_code}")
        if resp.status_code >= 400:
            return "next", "error"
        try:
            data = resp.json()
            if isinstance(data, dict) and len(str(data)) < 4000:
                ex.context = {**(ex.context or {}), "webhook_response": data, **{k: v for k, v in data.items() if isinstance(v, (str, int, float, bool))}}
                flag_modified(ex, "context")
        except ValueError:
            pass
        return "next", None
    except (httpx.HTTPError, UnsafeUrl) as exc:
        _log(ex, nid, "webhook_error", str(exc))
        return "next", "error"


def _evaluate(data: dict, contact: Contact, ctx: dict, conv: Conversation | None, last_message: str | None) -> bool:
    results = [_rule(rule, contact, ctx, last_message) for rule in data.get("rules", [])]
    return (any(results) if data.get("match") == "any" else all(results)) if results else False


def _rule(rule: dict, contact: Contact, ctx: dict, last_message: str | None) -> bool:
    left_key, op, right = rule.get("left", ""), rule.get("op", "eq"), str(rule.get("right", ""))
    if left_key == "tag":
        return (right in (contact.tags or [])) == (op != "not_exists")
    if left_key.startswith("var:"):
        left = ctx.get(left_key[4:])
    elif left_key.startswith("trait:"):
        left = (contact.custom_fields or {}).get(left_key[6:])
    elif left_key == "last_message":
        left = last_message
    else:
        left = {"name": contact.name, "username": contact.ig_username, "phone": contact.phone, "email": contact.email}.get(left_key)
    if op == "exists":
        return left not in (None, "")
    if op == "not_exists":
        return left in (None, "")
    ls = str(left if left is not None else "").strip().lower()
    rs = right.strip().lower()
    if op == "eq":
        return ls == rs
    if op == "neq":
        return ls != rs
    if op == "contains":
        return rs in ls
    if op == "not_contains":
        return rs not in ls
    if op in {"gt", "lt"}:
        try:
            return (float(ls) > float(rs)) if op == "gt" else (float(ls) < float(rs))
        except ValueError:
            return False
    return False


def validate_answer(kind: str, text: str, options: list[str] | None) -> tuple[bool, Any]:
    text = (text or "").strip()
    if not text:
        return False, None
    if kind == "number":
        try:
            return True, float(text.replace(",", ""))
        except ValueError:
            return False, None
    if kind == "email":
        return (True, text.lower()) if EMAIL_RE.match(text) else (False, None)
    if kind == "phone":
        try:
            return True, normalize_phone(text)
        except InvalidPhone:
            return False, None
    if kind == "date":
        for fmt in DATE_FORMATS:
            try:
                return True, datetime.strptime(text, fmt).date().isoformat()
            except ValueError:
                continue
        return False, None
    if kind == "choice":
        for o in options or []:
            if text.lower() == str(o).lower():
                return True, o
        return False, None
    return True, text


async def resume_on_reply(db: AsyncSession, ex: AutomationExecution, msg: Message) -> None:
    """The contact answered while a run was waiting on them."""
    flow = await db.get(AutomationFlow, ex.flow_id)
    graph = flow.published_snapshot if flow else None
    if not graph or ex.current_node not in _nodes(graph):
        ex.status, ex.error = "failed", "Flow changed while this run was waiting."
        await db.commit()
        return
    node = _nodes(graph)[ex.current_node]
    d = node.get("data") or {}
    tenant, contact, conv, account = await _load_ctx(db, ex)
    ex.status, ex.waiting_for = "running", None
    reply_id = (msg.payload or {}).get("reply_id")

    if node["type"] in {"send_buttons", "send_list"}:
        options = _options(node)
        valid_ids = {o["payload"] for o in options}
        if reply_id not in valid_ids:  # typed the option instead of tapping it
            typed = (msg.body or "").strip().casefold()
            reply_id = next((o["payload"] for o in options if o["title"].casefold() == typed), reply_id)
        handle = reply_id if reply_id in valid_ids else "default"
        if handle == "default" and not next_node(graph, node["id"], "default"):
            ex.status, ex.waiting_for = "waiting", "reply"  # free text where a tap was expected: keep waiting
            await db.commit()
            return
        _log(ex, node["id"], "replied", str(reply_id or msg.body)[:80])
        await _run(db, ex, graph, next_node(graph, node["id"], handle))
        return

    if node["type"] == "ask_question":
        ok, value = validate_answer(d.get("validation", "text"), msg.body or "", d.get("options"))
        key = f"_retries:{node['id']}"
        if not ok:
            tries = int((ex.context or {}).get(key, 0)) + 1
            ex.context = {**(ex.context or {}), key: tries}
            flag_modified(ex, "context")
            if tries >= int(d.get("max_retries", 3)):
                _log(ex, node["id"], "validation_failed", f"{tries} attempts")
                nxt = next_node(graph, node["id"], "failed")
                if nxt:
                    await _run(db, ex, graph, nxt)
                else:  # no explicit fail path -> hand the conversation to a human
                    await _handoff(db, ex, node, tenant, conv, None)
                    ex.status = "completed"
                    await db.commit()
                return
            ex.status, ex.waiting_for = "waiting", "reply"
            await _send(db, ex, node, account, conv, contact, kind="text", text=d.get("retry_message") or "Sorry, that doesn't look right. Please try again.")
            await db.commit()
            return
        if d.get("save_as", "trait") == "trait":
            contact.custom_fields = {**(contact.custom_fields or {}), d["key"]: value}
        ex.context = {**(ex.context or {}), d["key"]: value}
        flag_modified(ex, "context")
        _log(ex, node["id"], "answered", f"{d['key']}={value}")
        await _run(db, ex, graph, next_node(graph, node["id"], "success") or next_node(graph, node["id"]))
        return

    await _run(db, ex, graph, next_node(graph, node["id"]))


async def resume_timed(db: AsyncSession, ex: AutomationExecution) -> None:
    flow = await db.get(AutomationFlow, ex.flow_id)
    graph = flow.published_snapshot if flow else None
    if not graph or ex.current_node not in _nodes(graph):
        ex.status, ex.error = "failed", "Flow changed while this run was waiting."
        await db.commit()
        return
    ex.status, ex.waiting_for, ex.wait_until = "running", None, None
    _log(ex, ex.current_node, "resumed")
    await _run(db, ex, graph, next_node(graph, ex.current_node))


async def due_executions(db: AsyncSession, limit: int = 50) -> list[AutomationExecution]:
    """Timed waits that are due. SKIP LOCKED lets a second instance run safely without double-processing."""
    return list((await db.execute(
        select(AutomationExecution).where(AutomationExecution.status == "waiting", AutomationExecution.waiting_for == "time", AutomationExecution.wait_until <= utcnow())
        .order_by(AutomationExecution.wait_until).limit(limit).with_for_update(skip_locked=True)
    )).scalars())
