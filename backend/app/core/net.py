"""SSRF guard for user-supplied URLs (outbound webhooks, knowledge-base crawling, flow webhook nodes)."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit

from app.core.config import get_settings


class UnsafeUrl(ValueError):
    pass


def assert_public_url(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise UnsafeUrl("URL must start with http:// or https://")
    if get_settings().is_production and parts.scheme != "https":
        raise UnsafeUrl("URL must use https://")
    if parts.username or parts.password:
        raise UnsafeUrl("URL must not contain credentials.")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UnsafeUrl(f"Could not resolve host '{parts.hostname}'.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise UnsafeUrl("URL resolves to a private or internal address.")
