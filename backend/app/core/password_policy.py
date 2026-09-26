"""
Password policy — single source of truth for what a "strong enough" password
looks like. Ported from the reference product's lib/security/passwordPolicy.js
(kept deliberately close: 12-char minimum, 3-of-4 character classes, a curated
common-password blocklist, and an identity check) — see the plan file's
"Auth, Plans & Dashboard Shell" section for the original.

Design notes (unchanged from the reference):
  - 12 char minimum. NIST SP 800-63B allows 8, but 12 is the modern baseline
    that resists offline brute-force against a bcrypt hash for the lifetime
    of an average business SaaS engagement.
  - Three of four character classes required (upper, lower, digit, symbol).
    Requiring all four raises abandonment sharply for little real security
    gain vs. length; three is the common enterprise middle ground.
  - Common-password list is a small hand-curated set, not a full breach
    check (that needs an outbound API call — a good later addition).
  - Never trust the client. Every endpoint that accepts a password must
    re-run this validator before hashing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

MIN_LENGTH = 12
MAX_LENGTH = 128  # bcrypt truncates at 72; anything past 128 is nonsense
REQUIRED_CLASSES = 3  # of 4: upper, lower, digit, symbol

COMMON_PASSWORDS = {
    "123456", "12345678", "123456789", "1234567890", "12345", "1234567", "111111",
    "password", "password1", "password123", "passw0rd", "admin", "admin123",
    "qwerty", "qwerty123", "qwertyuiop", "asdfghjkl", "zxcvbnm",
    "letmein", "welcome", "welcome1", "monkey", "dragon", "iloveyou", "sunshine",
    "princess", "football", "baseball", "starwars", "master", "trustno1",
    "abc123", "abcd1234", "abcdef", "test123", "test1234", "temp1234",
    "000000", "11111111", "00000000", "aaaaaa", "aaaaaaaa",
    "leadforgrow", "leadforgrow123",
}

_RX_UPPER = re.compile(r"[A-Z]")
_RX_LOWER = re.compile(r"[a-z]")
_RX_DIGIT = re.compile(r"[0-9]")
_RX_SYMBOL = re.compile(r"[^A-Za-z0-9]")
_RX_SEQUENCE = re.compile(r"^(?:0123456789|1234567890|abcdefghij|qwertyuiop)")


@dataclass
class PasswordCheckResult:
    ok: bool
    score: int  # 0..4, informational
    strength: str  # weak|fair|strong|excellent
    failures: list[dict[str, str]] = field(default_factory=list)


def evaluate_password(password: str, *, email: str | None = None, name: str | None = None) -> PasswordCheckResult:
    pw = password or ""
    lower = pw.lower()

    classes_met = sum(
        1
        for rx in (_RX_UPPER, _RX_LOWER, _RX_DIGIT, _RX_SYMBOL)
        if rx.search(pw)
    )

    checks = {
        "min_length": len(pw) >= MIN_LENGTH,
        "max_length": len(pw) <= MAX_LENGTH,
        "classes_met": classes_met >= REQUIRED_CLASSES,
        "not_common": lower not in COMMON_PASSWORDS,
        "not_trivial_repeat": not (len(set(pw)) <= 1 and len(pw) > 0) and not _RX_SEQUENCE.match(lower),
        "not_containing_identity": True,
    }

    prefix = (email or "").split("@")[0].lower()
    if prefix and len(prefix) >= 4 and prefix in lower:
        checks["not_containing_identity"] = False
    name_compact = re.sub(r"\s+", "", (name or "").lower())
    if name_compact and len(name_compact) >= 4 and name_compact in lower:
        checks["not_containing_identity"] = False

    failures: list[dict[str, str]] = []
    if not checks["min_length"]:
        failures.append({"rule": "min_length", "message": f"At least {MIN_LENGTH} characters."})
    if not checks["max_length"]:
        failures.append({"rule": "max_length", "message": f"At most {MAX_LENGTH} characters."})
    if not checks["classes_met"]:
        failures.append({
            "rule": "classes_met",
            "message": f"Include at least {REQUIRED_CLASSES} of: uppercase, lowercase, number, symbol.",
        })
    if not checks["not_common"]:
        failures.append({"rule": "not_common", "message": "That password appears in known breach lists. Pick something less common."})
    if not checks["not_trivial_repeat"]:
        failures.append({"rule": "not_trivial_repeat", "message": "Avoid trivial patterns like aaaaaa or 123456789."})
    if not checks["not_containing_identity"]:
        failures.append({"rule": "not_containing_identity", "message": "Password should not contain your email or name."})

    score = 0
    if len(pw) >= MIN_LENGTH:
        score += 1
    if len(pw) >= 16:
        score += 1
    if classes_met >= 3:
        score += 1
    if classes_met == 4:
        score += 1
    strength = ["weak", "weak", "fair", "strong", "excellent"][score]

    return PasswordCheckResult(ok=len(failures) == 0, score=score, strength=strength, failures=failures)


def password_policy_description() -> str:
    return (
        f"Passwords must be at least {MIN_LENGTH} characters and mix any {REQUIRED_CLASSES} of: "
        "uppercase, lowercase, number, symbol. We block common breach-list passwords too."
    )
