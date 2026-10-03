"""Thin async client for the Instagram API with Instagram Login (graph.instagram.com). No business logic lives here."""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)

# Meta error codes worth special handling.
CODE_AUTH = {190, 102}
CODE_PERMISSION = {10, 200, 230}
CODE_RATE_LIMIT = {4, 17, 32, 613}
# "This message is sent outside of allowed window" / private reply already sent or comment too old.
CODE_OUTSIDE_WINDOW = {10, 2018278, 2534022}

# Fields read from the connected account (GET /me).
ME_FIELDS = "id,user_id,username,name,account_type,profile_picture_url,followers_count,media_count"
MEDIA_FIELDS = "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count"
# Webhook fields the app subscribes each account to.
WEBHOOK_FIELDS = "comments,live_comments,messages,messaging_postbacks,messaging_seen,message_reactions,messaging_referral"


class GraphError(Exception):
    def __init__(self, message: str, *, status: int = 0, code: int | None = None, subcode: int | None = None, details: str | None = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.subcode = subcode
        self.details = details

    @property
    def is_auth_error(self) -> bool:
        return self.code in CODE_AUTH or self.status == 401

    @property
    def is_rate_limited(self) -> bool:
        return self.code in CODE_RATE_LIMIT or self.status == 429

    @property
    def is_transient(self) -> bool:
        return self.is_rate_limited or self.status >= 500 or self.status == 0

    def __str__(self) -> str:
        detail = f" ({self.details})" if self.details and self.details not in self.message else ""
        return f"{self.message}{detail}"


# Tests replace this to route traffic to httpx.MockTransport.
_http_factory: Callable[[], httpx.AsyncClient] | None = None
_shared: httpx.AsyncClient | None = None


def _http() -> httpx.AsyncClient:
    global _shared
    if _http_factory is not None:
        return _http_factory()
    if _shared is None or _shared.is_closed:
        _shared = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0), limits=httpx.Limits(max_connections=50))
    return _shared


async def close_http() -> None:
    global _shared
    if _shared is not None and not _shared.is_closed:
        await _shared.aclose()
    _shared = None


def _parse_error(resp: httpx.Response) -> GraphError:
    try:
        data = resp.json()
    except Exception:  # noqa: BLE001 — non-JSON error body
        data = {}
    err = data.get("error", {}) if isinstance(data.get("error"), dict) else {}
    # The token endpoint on api.instagram.com returns {error_type, code, error_message} instead of Graph's {error: {...}}.
    message = err.get("error_user_msg") or err.get("message") or data.get("error_message") or f"Instagram API returned HTTP {resp.status_code}"
    return GraphError(message, status=resp.status_code, code=err.get("code") or data.get("code"), subcode=err.get("error_subcode"),
                      details=err.get("error_user_title"))


async def _send(method: str, url: str, *, retries: int = 2, **kwargs: Any) -> dict:
    last: GraphError | None = None
    for attempt in range(retries + 1):
        try:
            resp = await _http().request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            last = GraphError(f"Could not reach Instagram: {exc.__class__.__name__}", status=0)
        else:
            if resp.status_code < 400:
                return resp.json() if resp.content else {}
            last = _parse_error(resp)
        # Retry only transient failures (network / 5xx). Rate limits are surfaced so callers can back off.
        if not (last.status >= 500 or last.status == 0) or attempt == retries:
            break
    assert last is not None
    raise last


def _base() -> str:
    s = get_settings()
    return f"{s.instagram_graph_base.rstrip('/')}/{s.graph_api_version}"


class GraphClient:
    def __init__(self, access_token: str, ig_user_id: str = "me"):
        self.token = access_token
        self.ig_user_id = ig_user_id or "me"
        self.base = _base()

    async def _request(self, method: str, path: str, *, retries: int = 2, **kwargs: Any) -> dict:
        url = path if path.startswith("http") else f"{self.base}/{path.lstrip('/')}"
        headers = {"Authorization": f"Bearer {self.token}", **kwargs.pop("headers", {})}
        return await _send(method, url, retries=retries, headers=headers, **kwargs)

    # ---- account ----------------------------------------------------------------------------------------------
    async def me(self) -> dict:
        return await self._request("GET", "me", params={"fields": ME_FIELDS}, retries=1)

    async def subscribe_webhooks(self, fields: str = WEBHOOK_FIELDS) -> None:
        await self._request("POST", f"{self.ig_user_id}/subscribed_apps", params={"subscribed_fields": fields}, retries=1)

    async def unsubscribe_webhooks(self) -> None:
        await self._request("DELETE", f"{self.ig_user_id}/subscribed_apps", retries=0)

    async def list_media(self, limit: int = 25, after: str | None = None) -> dict:
        params: dict[str, Any] = {"fields": MEDIA_FIELDS, "limit": min(limit, 50)}
        if after:
            params["after"] = after
        return await self._request("GET", f"{self.ig_user_id}/media", params=params)

    async def get_media(self, media_id: str) -> dict:
        return await self._request("GET", media_id, params={"fields": MEDIA_FIELDS}, retries=1)

    async def user_profile(self, igsid: str) -> dict:
        """Profile of someone who messaged the account (only works once they have an open conversation)."""
        fields = "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user"
        return await self._request("GET", igsid, params={"fields": fields}, retries=0)

    # ---- messaging --------------------------------------------------------------------------------------------
    async def send(self, recipient: dict, message: dict | None = None, *, tag: str | None = None, sender_action: str | None = None) -> str:
        """POST /{ig-user-id}/messages. `recipient` is {"id": IGSID} or {"comment_id": ...} for a private reply. Returns the message id."""
        body: dict[str, Any] = {"recipient": recipient}
        if message is not None:
            body["message"] = message
        if sender_action:
            body["sender_action"] = sender_action
        if tag:
            body["messaging_type"], body["tag"] = "MESSAGE_TAG", tag
        data = await self._request("POST", f"{self.ig_user_id}/messages", json=body, retries=1)
        return str(data.get("message_id") or "")

    async def send_text(self, igsid: str, text: str, *, quick_replies: list[dict] | None = None, tag: str | None = None) -> str:
        message: dict[str, Any] = {"text": text}
        if quick_replies:
            message["quick_replies"] = quick_replies
        return await self.send({"id": igsid}, message, tag=tag)

    async def send_attachment(self, igsid: str, kind: str, url: str, *, tag: str | None = None) -> str:
        """kind: image|video|audio|file — the file must be at a public HTTPS url."""
        return await self.send({"id": igsid}, {"attachment": {"type": kind, "payload": {"url": url}}}, tag=tag)

    async def send_buttons(self, igsid: str | None, text: str, buttons: list[dict], *, comment_id: str | None = None, tag: str | None = None) -> str:
        """Button template (max 3). buttons: [{type: web_url, url, title} | {type: postback, payload, title}]."""
        message = {"attachment": {"type": "template", "payload": {"template_type": "button", "text": text, "buttons": buttons[:3]}}}
        recipient = {"comment_id": comment_id} if comment_id else {"id": igsid}
        return await self.send(recipient, message, tag=tag)

    async def private_reply(self, comment_id: str, text: str) -> str:
        """DM the author of a comment. Meta allows one private reply per comment, within 7 days of it."""
        return await self.send({"comment_id": comment_id}, {"text": text})

    async def mark_seen(self, igsid: str) -> None:
        await self.send({"id": igsid}, sender_action="mark_seen")

    # ---- comments ---------------------------------------------------------------------------------------------
    async def list_comments(self, media_id: str, max_comments: int = 5000) -> list[dict]:
        """All top-level comments on a post (id, text, username, from, timestamp), following pagination up to max_comments."""
        out: list[dict] = []
        url: str = f"{media_id}/comments"
        params: dict[str, Any] | None = {"fields": "id,text,username,timestamp,from", "limit": 50}
        while url and len(out) < max_comments:
            data = await self._request("GET", url, params=params)
            out.extend(data.get("data", []))
            url, params = (data.get("paging") or {}).get("next") or "", None
        return out[:max_comments]

    async def reply_to_comment(self, comment_id: str, text: str) -> str:
        data = await self._request("POST", f"{comment_id}/replies", params={"message": text}, retries=0)
        return str(data.get("id") or "")

    async def hide_comment(self, comment_id: str, hide: bool = True) -> None:
        await self._request("POST", comment_id, params={"hide": "true" if hide else "false"}, retries=0)

    async def delete_comment(self, comment_id: str) -> None:
        await self._request("DELETE", comment_id, retries=0)

    # ---- content publishing -----------------------------------------------------------------------------------
    async def create_container(self, **params: Any) -> str:
        """POST /{ig-user-id}/media — returns a container id. params: image_url | video_url, media_type, caption, is_carousel_item, children."""
        data = await self._request("POST", f"{self.ig_user_id}/media", params={k: v for k, v in params.items() if v not in (None, "")}, retries=0)
        return str(data["id"])

    async def container_status(self, container_id: str) -> str:
        """IN_PROGRESS | FINISHED | ERROR | EXPIRED | PUBLISHED"""
        data = await self._request("GET", container_id, params={"fields": "status_code,status"}, retries=1)
        return str(data.get("status_code") or "IN_PROGRESS")

    async def publish_container(self, container_id: str) -> str:
        data = await self._request("POST", f"{self.ig_user_id}/media_publish", params={"creation_id": container_id}, retries=0)
        return str(data["id"])

    async def publishing_limit(self) -> dict:
        data = await self._request("GET", f"{self.ig_user_id}/content_publishing_limit", params={"fields": "quota_usage,config"}, retries=1)
        return (data.get("data") or [{}])[0]

    async def comment_on_media(self, media_id: str, text: str) -> str:
        data = await self._request("POST", f"{media_id}/comments", params={"message": text}, retries=0)
        return str(data.get("id") or "")

    # ---- insights ---------------------------------------------------------------------------------------------
    async def insights(self, object_id: str, metrics: list[str], **params: Any) -> list[dict]:
        """GET /{id}/insights. Metrics Instagram rejects for this object are skipped rather than failing the whole call."""
        try:
            data = await self._request("GET", f"{object_id}/insights", params={"metric": ",".join(metrics), **params}, retries=1)
            return data.get("data", [])
        except GraphError as exc:
            if exc.is_auth_error or exc.is_rate_limited:
                raise
            if len(metrics) == 1:
                return []
        out: list[dict] = []
        for m in metrics:  # one bad metric (not available for this media type / account size) shouldn't hide the rest
            out.extend(await self.insights(object_id, [m], **params))
        return out

    # ---- welcome screen ---------------------------------------------------------------------------------------
    async def set_ice_breakers(self, questions: list[dict]) -> None:
        """questions: [{question, payload}] (max 4). An empty list removes them."""
        if not questions:
            await self._request("DELETE", "me/messenger_profile", json={"fields": ["ice_breakers"]}, retries=0)
            return
        await self._request("POST", "me/messenger_profile", json={
            "platform": "instagram", "ice_breakers": [{"call_to_actions": questions[:4], "locale": "default"}],
        }, retries=0)


# ---- OAuth (Instagram Business Login) -------------------------------------------------------------------------------

SCOPES = ("instagram_business_basic", "instagram_business_manage_messages", "instagram_business_manage_comments",
          "instagram_business_content_publish", "instagram_business_manage_insights")


def authorize_url(state: str, redirect_uri: str) -> str:
    s = get_settings()
    from urllib.parse import urlencode

    # Same shape as the "Embed URL" Meta shows under Business login settings, plus our signed `state`.
    query = urlencode({"force_reauth": "true", "client_id": s.instagram_app_id, "redirect_uri": redirect_uri, "response_type": "code",
                       "scope": ",".join(SCOPES), "state": state})
    return f"{s.instagram_oauth_base.rstrip('/')}/oauth/authorize?{query}"


async def exchange_code(code: str, redirect_uri: str) -> dict:
    """Authorization code -> short-lived token: {access_token, user_id, permissions}."""
    s = get_settings()
    if not (s.instagram_app_id and s.instagram_app_secret):
        raise GraphError("Instagram login is not configured on this server (INSTAGRAM_APP_ID / INSTAGRAM_APP_SECRET).", status=400)
    data = await _send("POST", f"{s.instagram_token_base.rstrip('/')}/oauth/access_token", retries=0, data={
        "client_id": s.instagram_app_id, "client_secret": s.instagram_app_secret, "grant_type": "authorization_code",
        "redirect_uri": redirect_uri, "code": code.removesuffix("#_"),
    })
    # Older responses wrap the result in {"data": [...]}.
    if isinstance(data.get("data"), list) and data["data"]:
        data = data["data"][0]
    if not data.get("access_token"):
        raise GraphError("Instagram did not return an access token.", status=400)
    return data


async def long_lived_token(short_token: str) -> dict:
    """Short-lived (1h) -> long-lived (60 days) token: {access_token, token_type, expires_in}."""
    s = get_settings()
    return await _send("GET", f"{s.instagram_graph_base.rstrip('/')}/access_token", retries=1, params={
        "grant_type": "ig_exchange_token", "client_secret": s.instagram_app_secret, "access_token": short_token,
    })


async def refresh_token(token: str) -> dict:
    """Extend a long-lived token by another 60 days (allowed once it is at least 24 hours old)."""
    s = get_settings()
    return await _send("GET", f"{s.instagram_graph_base.rstrip('/')}/refresh_access_token", retries=1, params={
        "grant_type": "ig_refresh_token", "access_token": token,
    })
