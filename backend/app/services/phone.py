"""Phone number normalisation to digits-only E.164 without the leading '+' (contacts captured via leads, CSV and integrations)."""

from __future__ import annotations

import re

_NON_DIGITS = re.compile(r"\D+")


class InvalidPhone(ValueError):
    pass


def normalize_phone(raw: str, default_country_code: str = "") -> str:
    """Return digits-only international format (e.g. 919876543210). Raises InvalidPhone if it can't be a real, routable number.

    - "+91 98765 43210", "0091 98765 43210" -> already international.
    - A national number (<= 10 digits, no '+') needs the workspace's default country code; without one it is rejected
      rather than guessed, because a message to the wrong country is worse than a clear error.
    """
    if raw is None or not str(raw).strip():
        raise InvalidPhone("Phone number is required.")
    text = str(raw).strip()
    international = text.startswith("+")
    digits = _NON_DIGITS.sub("", text)
    if digits.startswith("00"):  # 0044... international dialling prefix
        digits, international = digits[2:], True
    cc = _NON_DIGITS.sub("", default_country_code or "")

    if not international and len(digits) <= 10:
        if not cc:
            raise InvalidPhone(f"'{raw}' has no country code — write it as +<country code><number>, or set a default country code in Settings.")
        digits = cc + digits.lstrip("0")  # drop the national trunk prefix (e.g. 09876543210 -> 9876543210)
    if not 8 <= len(digits) <= 15:
        raise InvalidPhone(f"'{raw}' is not a valid phone number (need country code + number, 8-15 digits).")
    return digits


def display_phone(digits: str) -> str:
    return f"+{digits}" if digits else ""
