"""Marketing-site endpoints (no login): contact / demo requests and newsletter sign-ups."""

from __future__ import annotations

import html
import logging
import re

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core import ratelimit
from app.core.config import get_settings
from app.models.public_forms import ContactMessage, NewsletterSubscriber
from app.services import mailer

log = logging.getLogger(__name__)
router = APIRouter(prefix="/site", tags=["site"])

TOPICS = {"sales", "demo", "support", "partnership", "press", "other"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def _email(v: str) -> str:
    v = (v or "").strip().lower()
    if not EMAIL_RE.match(v) or len(v) > 320:
        raise ValueError("Enter a valid email address.")
    return v


class ContactIn(BaseModel):
    topic: str = "sales"
    name: str = Field(min_length=1, max_length=200)
    email: str
    phone: str | None = Field(default=None, max_length=40)
    company: str | None = Field(default=None, max_length=200)
    message: str = Field(min_length=5, max_length=4000)
    page: str | None = Field(default=None, max_length=300)
    website: str | None = Field(default=None, max_length=200, description="Honeypot — real visitors leave this empty")

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return _email(v)

    @field_validator("topic")
    @classmethod
    def _topic(cls, v: str) -> str:
        return v if v in TOPICS else "other"


class NewsletterIn(BaseModel):
    email: str
    source: str = Field(default="site", max_length=64)
    website: str | None = Field(default=None, max_length=200)

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        return _email(v)


@router.post("/contact", status_code=201)
async def contact(body: ContactIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    ratelimit.limit(request, "site-contact", 5, 3600)
    if body.website:  # a bot filled the hidden field: pretend it worked
        return {"ok": True}
    row = ContactMessage(topic=body.topic, name=body.name.strip(), email=body.email, phone=(body.phone or "").strip() or None, company=(body.company or "").strip() or None,
                         message=body.message.strip(), page=body.page, ip_address=ratelimit.client_ip(request)[:64], status="new")
    db.add(row)
    await db.commit()
    s = get_settings()
    to = s.contact_notify_email or s.company_email
    if to and mailer.enabled():
        rows = [("Topic", body.topic), ("Name", body.name), ("Email", body.email), ("Phone", body.phone or "-"), ("Company", body.company or "-"), ("Page", body.page or "-")]
        details = "".join(f"<p><b>{k}:</b> {html.escape(str(v))}</p>" for k, v in rows)
        await mailer.send(to, f"[{body.topic}] New enquiry from {body.name}", f"{details}<p><b>Message:</b></p><p>{html.escape(body.message).replace(chr(10), '<br>')}</p>")
    return {"ok": True}


@router.post("/newsletter", status_code=201)
async def newsletter(body: NewsletterIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    ratelimit.limit(request, "site-newsletter", 10, 3600)
    if body.website:
        return {"ok": True}
    exists = (await db.execute(select(NewsletterSubscriber.id).where(NewsletterSubscriber.email == body.email))).first()
    if not exists:
        db.add(NewsletterSubscriber(email=body.email, source=body.source))
        await db.commit()
    return {"ok": True}
