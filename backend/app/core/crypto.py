"""Symmetric encryption for third-party credentials (Instagram tokens, AI keys, integration secrets)."""

from __future__ import annotations

import base64
import hashlib
import json
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings


class CryptoError(RuntimeError):
    pass


@lru_cache
def _fernet() -> Fernet:
    secret = get_settings().encryption_key
    if not secret:
        raise CryptoError("ENCRYPTION_KEY is not configured; cannot store third-party credentials.")
    # Accept any string: derive a valid 32-byte urlsafe key so operators can't get the format wrong.
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise CryptoError("Stored credential could not be decrypted (ENCRYPTION_KEY changed?).") from exc


def encrypt_json(data: dict) -> str:
    return encrypt(json.dumps(data))


def decrypt_json(token: str) -> dict:
    return json.loads(decrypt(token))


def mask(value: str, keep: int = 4) -> str:
    if not value:
        return ""
    return "•" * max(len(value) - keep, 4) + value[-keep:]
