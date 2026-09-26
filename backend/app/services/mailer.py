"""Transactional email via Resend. Without RESEND_API_KEY nothing is sent and callers fall back to showing the link in the UI."""

from __future__ import annotations

import logging

import httpx

from app.core.config import get_settings

log = logging.getLogger(__name__)


def enabled() -> bool:
    return bool(get_settings().resend_api_key)


async def send(to: str, subject: str, html: str) -> bool:
    s = get_settings()
    if not s.resend_api_key:
        log.warning("email to %s not sent: RESEND_API_KEY is not configured", to)
        return False
    try:
        async with httpx.AsyncClient(timeout=15) as http:
            resp = await http.post("https://api.resend.com/emails", headers={"Authorization": f"Bearer {s.resend_api_key}"},
                                   json={"from": s.email_from, "to": [to], "subject": subject, "html": html})
        if resp.status_code >= 400:
            log.error("resend rejected email (%s): %s", resp.status_code, resp.text[:200])
            return False
        return True
    except httpx.HTTPError:
        log.exception("email send failed")
        return False


def button_html(heading: str, body: str, cta: str, url: str) -> str:
    return (f'<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px"><h2 style="color:#111">{heading}</h2>'
            f'<p style="color:#444;line-height:1.5">{body}</p><p><a href="{url}" style="background:#00926B;color:#fff;padding:12px 20px;border-radius:8px;'
            f'text-decoration:none;display:inline-block">{cta}</a></p><p style="color:#888;font-size:12px">If the button doesn\'t work, paste this link into your browser:<br>{url}</p></div>')
