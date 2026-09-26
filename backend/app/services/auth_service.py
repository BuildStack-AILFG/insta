"""
Auth business logic — register/login/refresh/logout/forgot+reset password.

Mirrors the reference product's app/api/auth/{register,login}/route.js flow:
register creates a Tenant + User + owner TenantMembership in one transaction,
defaults to the trial plan, and signs the user in immediately (no email
verification gate blocking first access). Login re-checks the password
against the *current* policy and flags `must_rotate_password` if it now
fails, without nagging on every login thereafter.
"""

from __future__ import annotations

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.password_policy import evaluate_password
from app.core.security import (
    TokenPair,
    decode_refresh_token,
    generate_reset_token,
    hash_password,
    hash_token,
    issue_token_pair,
    verify_password,
)
from app.models.plan import Plan
from app.services import entitlements
from app.models.refresh_token import RefreshToken
from app.models.tenant import Tenant, TenantMembership, User

_SLUG_RX = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    base = _SLUG_RX.sub("-", name.lower()).strip("-") or "workspace"
    return f"{base}-{secrets.token_hex(3)}"


async def _get_primary_membership(db: AsyncSession, user: User) -> TenantMembership:
    result = await db.execute(
        select(TenantMembership).where(TenantMembership.user_id == user.id).order_by(TenantMembership.created_at)
    )
    membership = result.scalars().first()
    if membership is None:
        raise HTTPException(status_code=500, detail="Account has no workspace. Please contact support.")
    return membership


async def register_user(
    db: AsyncSession,
    *,
    company_name: str,
    full_name: str | None,
    email: str,
    password: str,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[User, Tenant, TenantMembership, TokenPair]:
    email = email.strip().lower()

    check = evaluate_password(password, email=email, name=company_name)
    if not check.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": check.failures[0]["message"] if check.failures else "Weak password.", "password_failures": check.failures},
        )

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalars().first() is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "An account with this email already exists."})

    trial_plan = await db.get(Plan, "trial")
    if trial_plan is None:
        raise HTTPException(status_code=500, detail="No trial plan configured. Run the plan seed script first.")

    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name,
        password_updated_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()

    tenant = Tenant(
        name=company_name,
        slug=_slugify(company_name),
        plan_id=trial_plan.id,
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=await entitlements.trial_days(db)),
    )
    db.add(tenant)
    await db.flush()

    membership = TenantMembership(tenant_id=tenant.id, user_id=user.id, role="owner")
    db.add(membership)
    await db.flush()

    tokens = issue_token_pair(user_id=user.id, tenant_id=tenant.id, role=membership.role, plan_id=tenant.plan_id)
    await _store_refresh_token(db, user_id=user.id, tokens=tokens, user_agent=user_agent, ip_address=ip_address)

    await db.commit()
    return user, tenant, membership, tokens


async def login_user(
    db: AsyncSession,
    *,
    email: str,
    password: str,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[User, Tenant, TenantMembership, TokenPair, bool]:
    email = email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalars().first()
    if user is None or user.password_hash is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Invalid email or password."})

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "This account has been deactivated."})

    # The one moment we have the plaintext password: check it against the
    # *current* policy and flag (once) if it's grandfathered-weak.
    must_rotate = user.must_rotate_password
    if not must_rotate:
        check = evaluate_password(password, email=user.email)
        if not check.ok:
            user.must_rotate_password = True
            must_rotate = True

    tenant, membership, tokens = await _open_session(db, user, user_agent=user_agent, ip_address=ip_address)
    await db.commit()
    return user, tenant, membership, tokens, must_rotate


async def _open_session(
    db: AsyncSession, user: User, *, user_agent: str | None, ip_address: str | None
) -> tuple[Tenant, TenantMembership, TokenPair]:
    """Shared tail of every sign-in: stamp the login, check the workspace, issue + store a token pair. Caller commits."""
    user.last_login_at = datetime.now(timezone.utc)

    membership = await _get_primary_membership(db, user)
    tenant = await db.get(Tenant, membership.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=500, detail="Workspace not found for this account.")
    if tenant.status == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "This workspace has been suspended. Please contact support."})

    tokens = issue_token_pair(user_id=user.id, tenant_id=tenant.id, role=membership.role, plan_id=tenant.plan_id)
    await _store_refresh_token(db, user_id=user.id, tokens=tokens, user_agent=user_agent, ip_address=ip_address)
    return tenant, membership, tokens


_GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
_GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


async def _verify_google_credential(credential: str) -> dict:
    """Validates a Google Identity Services ID token via Google's tokeninfo endpoint (signature + expiry), then checks
    it was minted for *our* client id and carries a verified email. Returns the token claims."""
    client_id = get_settings().google_client_id
    if not client_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail={"error": "Google sign-in is not configured."})

    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Google sign-in failed. Please try again."})
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            resp = await http.get(_GOOGLE_TOKENINFO_URL, params={"id_token": credential})
    except httpx.HTTPError:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail={"error": "Couldn't reach Google. Please try again."})
    if resp.status_code != 200:
        raise invalid

    claims = resp.json()
    if claims.get("aud") != client_id or claims.get("iss") not in _GOOGLE_ISSUERS:
        raise invalid
    if str(claims.get("email_verified")).lower() != "true" or not claims.get("email"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Your Google account's email isn't verified."})
    return claims


async def google_sign_in(
    db: AsyncSession,
    *,
    credential: str,
    company_name: str | None,
    user_agent: str | None,
    ip_address: str | None,
) -> tuple[User, Tenant, TenantMembership, TokenPair, bool]:
    """Signs in with a Google ID token. An existing account with the same (Google-verified) email is signed in;
    otherwise a new user + trial workspace is created, same as register. The last item is True when it created one."""
    claims = await _verify_google_credential(credential)
    email = claims["email"].strip().lower()
    full_name = (claims.get("name") or "").strip()[:200] or None

    user = (await db.execute(select(User).where(User.email == email))).scalars().first()
    if user is not None:
        if not user.is_active:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "This account has been deactivated."})
        if not user.full_name and full_name:
            user.full_name = full_name
        tenant, membership, tokens = await _open_session(db, user, user_agent=user_agent, ip_address=ip_address)
        await db.commit()
        return user, tenant, membership, tokens, False

    trial_plan = await db.get(Plan, "trial")
    if trial_plan is None:
        raise HTTPException(status_code=500, detail="No trial plan configured. Run the plan seed script first.")

    workspace_name = (company_name or "").strip() or (f"{full_name.split()[0]}'s workspace" if full_name else email.split("@")[0])
    user = User(email=email, password_hash=None, full_name=full_name, auth_provider="google", last_login_at=datetime.now(timezone.utc))
    db.add(user)
    await db.flush()

    tenant = Tenant(
        name=workspace_name,
        slug=_slugify(workspace_name),
        plan_id=trial_plan.id,
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=await entitlements.trial_days(db)),
    )
    db.add(tenant)
    await db.flush()

    membership = TenantMembership(tenant_id=tenant.id, user_id=user.id, role="owner")
    db.add(membership)
    await db.flush()

    tokens = issue_token_pair(user_id=user.id, tenant_id=tenant.id, role=membership.role, plan_id=tenant.plan_id)
    await _store_refresh_token(db, user_id=user.id, tokens=tokens, user_agent=user_agent, ip_address=ip_address)

    await db.commit()
    return user, tenant, membership, tokens, True


async def _store_refresh_token(
    db: AsyncSession, *, user_id: uuid.UUID, tokens: TokenPair, user_agent: str | None, ip_address: str | None
) -> None:
    settings = get_settings()
    record = RefreshToken(
        user_id=user_id,
        jti=tokens.refresh_jti,
        token_hash=hash_token(tokens.refresh_token),
        user_agent=user_agent,
        ip_address=ip_address,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expires_days),
    )
    db.add(record)
    await db.flush()


async def refresh_access_token(db: AsyncSession, *, refresh_token: str) -> TokenPair:
    payload = decode_refresh_token(refresh_token)
    if payload is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Invalid or expired refresh token."})

    result = await db.execute(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    record = result.scalars().first()
    if record is None or record.revoked_at is not None or record.token_hash != hash_token(refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Refresh token has been revoked."})
    if record.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Refresh token has expired."})

    user = await db.get(User, record.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Account no longer active."})

    membership = await _get_primary_membership(db, user)
    tenant = await db.get(Tenant, membership.tenant_id)
    assert tenant is not None

    # Rotate: revoke the used refresh token, issue a fresh pair.
    record.revoked_at = datetime.now(timezone.utc)
    tokens = issue_token_pair(user_id=user.id, tenant_id=tenant.id, role=membership.role, plan_id=tenant.plan_id)
    await _store_refresh_token(db, user_id=user.id, tokens=tokens, user_agent=None, ip_address=None)

    await db.commit()
    return tokens


async def logout_user(db: AsyncSession, *, refresh_token: str) -> None:
    payload = decode_refresh_token(refresh_token)
    if payload is None:
        return
    result = await db.execute(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    record = result.scalars().first()
    if record is not None and record.revoked_at is None:
        record.revoked_at = datetime.now(timezone.utc)
        await db.commit()


async def request_password_reset(db: AsyncSession, *, email: str) -> str | None:
    """Returns the raw reset token so the caller can email it — or None if no such user (don't leak existence)."""
    result = await db.execute(select(User).where(User.email == email.strip().lower()))
    user = result.scalars().first()
    if user is None:
        return None

    raw_token = generate_reset_token()
    user.reset_token_hash = hash_token(raw_token)
    user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.commit()
    return raw_token


async def reset_password(db: AsyncSession, *, token: str, new_password: str) -> None:
    token_hash = hash_token(token)
    result = await db.execute(select(User).where(User.reset_token_hash == token_hash))
    user = result.scalars().first()
    if user is None or user.reset_token_expires_at is None or user.reset_token_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "This reset link is invalid or has expired."})

    check = evaluate_password(new_password, email=user.email)
    if not check.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": check.failures[0]["message"] if check.failures else "Weak password.", "password_failures": check.failures},
        )

    user.password_hash = hash_password(new_password)
    user.password_updated_at = datetime.now(timezone.utc)
    user.must_rotate_password = False
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    await _revoke_sessions(db, user.id)  # a reset means the old credentials may be compromised — sign every device out
    await db.commit()


async def rotate_password(db: AsyncSession, *, user: User, current_password: str, new_password: str) -> None:
    """For an already-authenticated user whose stored password failed the
    current policy check at login (`must_rotate_password`) — proves identity
    via the current password, same as a normal change-password flow."""
    if user.password_hash is None or not verify_password(current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Current password is incorrect."})

    check = evaluate_password(new_password, email=user.email)
    if not check.ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": check.failures[0]["message"] if check.failures else "Weak password.", "password_failures": check.failures},
        )

    user.password_hash = hash_password(new_password)
    user.password_updated_at = datetime.now(timezone.utc)
    user.must_rotate_password = False
    await _revoke_sessions(db, user.id)
    await db.commit()


async def _revoke_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)).values(revoked_at=datetime.now(timezone.utc)))
