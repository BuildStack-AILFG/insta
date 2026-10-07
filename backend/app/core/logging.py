"""Logging setup: every log line carries the request id it was written under; JSON lines in production, plain text locally."""

from __future__ import annotations

import json
import logging
import re
import uuid
from contextvars import ContextVar

request_id: ContextVar[str] = ContextVar("request_id", default="-")
_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def new_request_id(incoming: str | None) -> str:
    """Honour an upstream X-Request-ID only if it looks like an id (it ends up in logs and response headers)."""
    return incoming if incoming and _SAFE_ID.match(incoming) else uuid.uuid4().hex


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id.get()
        return True


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        out = {"ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"), "level": record.levelname, "logger": record.name,
               "request_id": getattr(record, "request_id", "-"), "message": record.getMessage()}
        if record.exc_info:
            out["exc"] = self.formatException(record.exc_info)
        return json.dumps(out, ensure_ascii=False)


def configure(json_logs: bool) -> None:
    handler = logging.StreamHandler()
    handler.addFilter(_RequestIdFilter())
    handler.setFormatter(_JsonFormatter() if json_logs else logging.Formatter("%(asctime)s %(levelname)s %(name)s [%(request_id)s]: %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)


def init_sentry(dsn: str, environment: str) -> None:
    if not dsn:
        return
    import sentry_sdk

    def drop_http_breadcrumbs(crumb, _hint):
        # Instagram token calls carry the app secret / access tokens in the query string — never ship those URLs.
        return None if crumb.get("category") in ("httplib", "httpx") else crumb

    sentry_sdk.init(dsn=dsn, environment=environment, send_default_pii=False, traces_sample_rate=0.0, before_breadcrumb=drop_http_breadcrumbs)
