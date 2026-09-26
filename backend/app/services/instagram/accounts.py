"""Connecting, refreshing and disconnecting Instagram professional accounts."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.crypto import decrypt, encrypt
from app.models.instagram_account import InstagramAccount
from app.services.instagram import graph
from app.services.instagram.graph import GraphClient, GraphError

log = logging.getLogger(__name__)

STATE_TTL = timedelta(minutes=15)
# Refresh long-lived tokens once they are within this long of expiring (they last 60 days; refresh is allowed after 24h).
REFRESH_WITHIN = timedelta(days=20)


class AccountError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def public_base(request_base: str | None = None) -> str:
    return (get_settings().public_base_url or request_base or "").rstrip("/")


def webhook_url(base: str) -> str:
    return f"{base.rstrip('/')}/api/webhooks/instagram"


def redirect_uri() -> str:
    s = get_settings()
    return s.instagram_redirect_uri or f"{s.frontend_url.rstrip('/')}/dashboard/instagram/callback"


def client_for(account: InstagramAccount) -> GraphClient:
    return GraphClient(decrypt(account.access_token_enc), account.ig_user_id)


# ---- OAuth state: a short-lived signed token that ties the callback to the workspace that started it ----------------

def make_state(tenant_id: uuid.UUID, user_id: uuid.UUID) -> str:
    payload = {"t": str(tenant_id), "u": str(user_id), "p": "ig_connect", "exp": utcnow() + STATE_TTL}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


def read_state(state: str, tenant_id: uuid.UUID, user_id: uuid.UUID) -> None:
    try:
        data = jwt.decode(state, get_settings().jwt_secret, algorithms=["HS256"])
    except JWTError as exc:
        raise AccountError("This Instagram login link has expired — click Connect again.") from exc
    if data.get("p") != "ig_connect" or data.get("t") != str(tenant_id) or data.get("u") != str(user_id):
        raise AccountError("This Instagram login was started from a different workspace or user.", 403)


# ---- connect ----------------------------------------------------------------------------------------------------

def _apply_profile(account: InstagramAccount, me: dict) -> None:
    account.app_scoped_id = str(me.get("id") or account.app_scoped_id or "") or None
    account.username = me.get("username") or account.username
    account.name = me.get("name") or account.name
    account.account_type = me.get("account_type") or account.account_type
    account.profile_picture_url = me.get("profile_picture_url") or account.profile_picture_url
    account.followers_count = me.get("followers_count", account.followers_count)
    account.media_count = me.get("media_count", account.media_count)


async def _store(db: AsyncSession, tenant_id: uuid.UUID, token: str, *, expires_in: int | None, scopes: list[str], connection_type: str) -> tuple[InstagramAccount, list[str]]:
    """Read the account behind `token`, then create or update its row and subscribe it to webhooks."""
    try:
        me = await GraphClient(token).me()
    except GraphError as exc:
        raise AccountError(f"Instagram rejected this access token: {exc}", 400 if not exc.is_transient else 502) from exc
    ig_user_id = str(me.get("user_id") or me.get("id") or "")
    if not ig_user_id:
        raise AccountError("Instagram did not return an account id for this token.", 502)
    if me.get("account_type") and me["account_type"] not in {"BUSINESS", "MEDIA_CREATOR"}:
        raise AccountError("Switch this Instagram account to a Professional (Business or Creator) account first — personal accounts have no API access.")

    account = (await db.execute(select(InstagramAccount).where(InstagramAccount.ig_user_id == ig_user_id))).scalar_one_or_none()
    if account is not None and account.tenant_id != tenant_id and account.status != "disconnected":
        raise AccountError(f"@{me.get('username')} is already connected to another workspace.", 409)
    if account is None:
        account = InstagramAccount(tenant_id=tenant_id, ig_user_id=ig_user_id, username=me.get("username") or ig_user_id, access_token_enc="", settings={})
        db.add(account)
    account.tenant_id = tenant_id
    account.access_token_enc = encrypt(token)
    account.token_expires_at = utcnow() + timedelta(seconds=expires_in) if expires_in else None
    account.scopes = scopes or account.scopes or []
    account.connection_type = connection_type
    account.status, account.last_error = "connected", None
    _apply_profile(account, me)
    account.last_synced_at = utcnow()
    await db.flush()

    warnings: list[str] = []
    try:
        await client_for(account).subscribe_webhooks()
        account.webhooks_subscribed = True
    except GraphError as exc:
        account.webhooks_subscribed = False
        warnings.append(f"Connected, but webhooks could not be switched on yet ({exc}). Comments and DMs won't arrive until this works — use Refresh to retry.")
    await db.commit()
    return account, warnings


async def connect_oauth(db: AsyncSession, tenant_id: uuid.UUID, code: str) -> tuple[InstagramAccount, list[str]]:
    try:
        short = await graph.exchange_code(code, redirect_uri())
        long = await graph.long_lived_token(short["access_token"])
    except GraphError as exc:
        raise AccountError(f"Could not finish connecting Instagram: {exc}", 400 if not exc.is_transient else 502) from exc
    scopes = short.get("permissions") or []
    if isinstance(scopes, str):
        scopes = [p.strip() for p in scopes.split(",") if p.strip()]
    return await _store(db, tenant_id, long["access_token"], expires_in=long.get("expires_in"), scopes=scopes, connection_type="oauth")


async def connect_manual(db: AsyncSession, tenant_id: uuid.UUID, access_token: str) -> tuple[InstagramAccount, list[str]]:
    """Paste a long-lived token (e.g. generated for a tester in the Meta app dashboard). Useful before App Review."""
    return await _store(db, tenant_id, access_token.strip(), expires_in=60 * 24 * 3600, scopes=[], connection_type="manual")


# ---- maintenance ------------------------------------------------------------------------------------------------

async def refresh_account(db: AsyncSession, account: InstagramAccount) -> None:
    """Re-read the profile, and re-subscribe webhooks if that previously failed. Marks the account errored on auth failure."""
    client = client_for(account)
    try:
        me = await client.me()
    except GraphError as exc:
        if exc.is_auth_error:
            account.status, account.last_error = "error", str(exc)[:500]
            await db.commit()
        raise
    _apply_profile(account, me)
    if not account.webhooks_subscribed:
        try:
            await client.subscribe_webhooks()
            account.webhooks_subscribed = True
        except GraphError as exc:
            log.info("webhook subscribe still failing for @%s: %s", account.username, exc)
    if account.status == "error":
        account.status, account.last_error = "connected", None
    account.last_synced_at = utcnow()
    await db.commit()


async def refresh_token_if_due(db: AsyncSession, account: InstagramAccount) -> bool:
    """Extend the long-lived token when it is close to expiring. Returns True when it was refreshed."""
    if account.token_expires_at and account.token_expires_at - utcnow() > REFRESH_WITHIN:
        return False
    try:
        data = await graph.refresh_token(decrypt(account.access_token_enc))
    except GraphError as exc:
        if exc.is_auth_error:
            account.status, account.last_error = "error", f"Access expired — reconnect Instagram. ({exc})"[:500]
            await db.commit()
        log.warning("token refresh failed for @%s: %s", account.username, exc)
        return False
    account.access_token_enc = encrypt(data["access_token"])
    account.token_expires_at = utcnow() + timedelta(seconds=int(data.get("expires_in") or 60 * 24 * 3600))
    await db.commit()
    return True
