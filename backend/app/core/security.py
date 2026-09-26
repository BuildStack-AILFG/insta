"""
Password hashing + JWT access/refresh token issuance.

Mirrors the reference product's lib/security/refreshToken.js: short-lived
access token, long-lived refresh token, refresh tokens persisted server-side
(hashed, never raw) so they can be revoked. See app/models/refresh_token.py.
"""

from __future__ import annotations

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # Malformed hash — never crash the login path over it.
        return False


def hash_token(raw_token: str) -> str:
    """SHA-256 of a refresh/reset token for at-rest storage — never store the raw token."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


@dataclass
class TokenPair:
    access_token: str
    refresh_token: str
    refresh_jti: str
    expires_in_minutes: int


def issue_token_pair(*, user_id: uuid.UUID, tenant_id: uuid.UUID | None, role: str, plan_id: str | None) -> TokenPair:
    settings = get_settings()
    now = datetime.now(timezone.utc)

    access_payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id) if tenant_id else None,
        "role": role,
        "plan": plan_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expires_minutes),
    }
    access_token = jwt.encode(access_payload, settings.jwt_secret, algorithm=ALGORITHM)

    refresh_jti = str(uuid.uuid4())
    refresh_payload = {
        "sub": str(user_id),
        "tenant_id": str(tenant_id) if tenant_id else None,
        "type": "refresh",
        "jti": refresh_jti,
        "iat": now,
        "exp": now + timedelta(days=settings.refresh_token_expires_days),
    }
    refresh_token = jwt.encode(refresh_payload, settings.refresh_token_secret, algorithm=ALGORITHM)

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token,
        refresh_jti=refresh_jti,
        expires_in_minutes=settings.access_token_expires_minutes,
    )


def decode_access_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "access":
        return None
    return payload


def decode_refresh_token(token: str) -> dict | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.refresh_token_secret, algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "refresh":
        return None
    return payload
