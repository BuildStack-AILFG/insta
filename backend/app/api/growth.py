"""Growth tools: ig.me ref links (with QR codes) and link-in-bio pages. Public bio endpoints need no login."""

from __future__ import annotations

import re
import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.api.deps import Ctx, get_ctx, get_db, require_writer
from app.core import ratelimit
from app.models.automation_flow import AutomationFlow
from app.models.growth import BioPage, RefLink
from app.models.instagram_account import InstagramAccount
from app.services.instagram.accounts import public_base
from app.services.instagram.growth import ref_url

router = APIRouter(prefix="/growth", tags=["growth"])
public = APIRouter(prefix="/public/bio", tags=["public"])

_SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$")
_REF = re.compile(r"^[A-Za-z0-9_-]{1,60}$")
URL = r"^https?://[^\s]+$"
RESERVED = {"admin", "api", "app", "dashboard", "login", "signup", "help", "support", "gramforgrow", "dmforgrow"}


class LinkButton(BaseModel):
    title: str = Field(min_length=1, max_length=20)
    url: str = Field(pattern=URL, max_length=2000)


class RefLinkIn(BaseModel):
    account_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    ref: str = Field(min_length=1, max_length=60)
    enabled: bool = True
    message: str = Field(default="", max_length=1000)
    buttons: list[LinkButton] = Field(default_factory=list, max_length=3)
    tag: str = Field(default="", max_length=50)
    flow_id: uuid.UUID | None = None

    @field_validator("ref")
    @classmethod
    def _ref(cls, v: str) -> str:
        v = v.strip()
        if not _REF.match(v):
            raise ValueError("Use letters, numbers, - and _ only (no spaces).")
        return v


class BioLink(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    url: str = Field(pattern=URL, max_length=2000)


class BioPageIn(BaseModel):
    account_id: uuid.UUID
    slug: str = Field(min_length=3, max_length=40)
    title: str = Field(default="", max_length=100)
    bio: str = Field(default="", max_length=500)
    links: list[BioLink] = Field(default_factory=list, max_length=20)
    dm_button_text: str = Field(default="", max_length=40)
    dm_ref_link_id: uuid.UUID | None = None
    published: bool = True

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not _SLUG.match(v) or v in RESERVED:
            raise ValueError("Use 3–40 lowercase letters, numbers and dashes.")
        return v


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _qr(url: str, base: str) -> str:
    return f"{base}/api/public/qr?text={quote(url, safe='')}&scale=10"


def _ref_out(r: RefLink, account: InstagramAccount, base: str) -> dict:
    url = ref_url(account.username, r.ref)
    return {"id": str(r.id), "account_id": str(r.account_id), "account_username": account.username, "name": r.name, "ref": r.ref, "enabled": r.enabled,
            "message": r.message, "buttons": r.buttons or [], "tag": r.tag, "flow_id": str(r.flow_id) if r.flow_id else None, "url": url, "qr_url": _qr(url, base),
            "opens": r.opens, "people": r.people, "last_opened_at": _iso(r.last_opened_at), "created_at": _iso(r.created_at)}


def _bio_out(p: BioPage, account: InstagramAccount) -> dict:
    return {"id": str(p.id), "account_id": str(p.account_id), "account_username": account.username, "slug": p.slug, "title": p.title, "bio": p.bio,
            "links": p.links or [], "dm_button_text": p.dm_button_text, "dm_ref_link_id": str(p.dm_ref_link_id) if p.dm_ref_link_id else None,
            "published": p.published, "views": p.views, "created_at": _iso(p.created_at)}


async def _account(db: AsyncSession, ctx: Ctx, account_id: uuid.UUID) -> InstagramAccount:
    account = await db.get(InstagramAccount, account_id)
    if account is None or account.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=422, detail={"error": "Choose one of your connected Instagram accounts."})
    return account


# ---- ref links -----------------------------------------------------------------------------------------------------

@router.get("/ref-links")
async def list_ref_links(request: Request, ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    base = public_base(str(request.base_url))
    rows = (await db.execute(select(RefLink, InstagramAccount).join(InstagramAccount, InstagramAccount.id == RefLink.account_id)
                             .where(RefLink.tenant_id == ctx.tenant_id).order_by(RefLink.created_at.desc()))).all()
    return [_ref_out(r, a, base) for r, a in rows]


async def _save_ref(db: AsyncSession, ctx: Ctx, r: RefLink, body: RefLinkIn) -> InstagramAccount:
    account = await _account(db, ctx, body.account_id)
    if body.flow_id:
        flow = await db.get(AutomationFlow, body.flow_id)
        if flow is None or flow.tenant_id != ctx.tenant_id:
            raise HTTPException(status_code=422, detail={"error": "That flow doesn't exist."})
    clash = (await db.execute(select(RefLink.id).where(RefLink.account_id == account.id, RefLink.ref == body.ref, RefLink.id != r.id))).first()
    if clash:
        raise HTTPException(status_code=409, detail={"error": f"A link with ref “{body.ref}” already exists for @{account.username}."})
    if not body.message.strip() and not body.flow_id:
        raise HTTPException(status_code=422, detail={"error": "Add a welcome message or choose a flow."})
    for k, v in body.model_dump(mode="json").items():
        setattr(r, k, v)
    r.account_id, r.flow_id = account.id, body.flow_id
    return account


@router.post("/ref-links", status_code=status.HTTP_201_CREATED)
async def create_ref_link(body: RefLinkIn, request: Request, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    r = RefLink(tenant_id=ctx.tenant_id, account_id=body.account_id, name=body.name, ref=body.ref)
    account = await _save_ref(db, ctx, r, body)
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return _ref_out(r, account, public_base(str(request.base_url)))


@router.put("/ref-links/{link_id}")
async def update_ref_link(link_id: uuid.UUID, body: RefLinkIn, request: Request, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    r = await db.get(RefLink, link_id)
    if r is None or r.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Link not found."})
    account = await _save_ref(db, ctx, r, body)
    await db.commit()
    await db.refresh(r)
    return _ref_out(r, account, public_base(str(request.base_url)))


@router.delete("/ref-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_ref_link(link_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    r = await db.get(RefLink, link_id)
    if r is None or r.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Link not found."})
    await db.delete(r)
    await db.commit()


# ---- link-in-bio pages ---------------------------------------------------------------------------------------------

@router.get("/bio-pages")
async def list_bio_pages(ctx: Ctx = Depends(get_ctx), db: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = (await db.execute(select(BioPage, InstagramAccount).join(InstagramAccount, InstagramAccount.id == BioPage.account_id)
                             .where(BioPage.tenant_id == ctx.tenant_id).order_by(BioPage.created_at))).all()
    return [_bio_out(p, a) for p, a in rows]


async def _save_bio(db: AsyncSession, ctx: Ctx, p: BioPage, body: BioPageIn) -> InstagramAccount:
    account = await _account(db, ctx, body.account_id)
    taken = (await db.execute(select(BioPage.id).where(BioPage.slug == body.slug, BioPage.id != p.id))).first()
    if taken:
        raise HTTPException(status_code=409, detail={"error": f"“{body.slug}” is taken — try another address."})
    if body.dm_ref_link_id:
        ref = await db.get(RefLink, body.dm_ref_link_id)
        if ref is None or ref.tenant_id != ctx.tenant_id:
            raise HTTPException(status_code=422, detail={"error": "That DM link doesn't exist."})
    old = {l.get("url"): l.get("clicks", 0) for l in p.links or []}
    p.account_id, p.slug, p.title, p.bio, p.published = account.id, body.slug, body.title.strip(), body.bio.strip(), body.published
    p.links = [{"title": l.title.strip(), "url": l.url, "clicks": old.get(l.url, 0)} for l in body.links]  # keep click counts for unchanged links
    p.dm_button_text, p.dm_ref_link_id = body.dm_button_text.strip(), body.dm_ref_link_id
    return account


@router.post("/bio-pages", status_code=status.HTTP_201_CREATED)
async def create_bio_page(body: BioPageIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    p = BioPage(tenant_id=ctx.tenant_id, account_id=body.account_id, slug=body.slug, links=[])
    account = await _save_bio(db, ctx, p, body)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return _bio_out(p, account)


@router.put("/bio-pages/{page_id}")
async def update_bio_page(page_id: uuid.UUID, body: BioPageIn, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> dict:
    p = await db.get(BioPage, page_id)
    if p is None or p.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Page not found."})
    account = await _save_bio(db, ctx, p, body)
    await db.commit()
    await db.refresh(p)
    return _bio_out(p, account)


@router.delete("/bio-pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_bio_page(page_id: uuid.UUID, ctx: Ctx = Depends(require_writer), db: AsyncSession = Depends(get_db)) -> None:
    p = await db.get(BioPage, page_id)
    if p is None or p.tenant_id != ctx.tenant_id:
        raise HTTPException(status_code=404, detail={"error": "Page not found."})
    await db.delete(p)
    await db.commit()


# ---- public ---------------------------------------------------------------------------------------------------------

async def _public_page(db: AsyncSession, slug: str) -> tuple[BioPage, InstagramAccount]:
    p = (await db.execute(select(BioPage).where(BioPage.slug == slug.lower()[:40], BioPage.published.is_(True)))).scalar_one_or_none()
    account = await db.get(InstagramAccount, p.account_id) if p else None
    if p is None or account is None:
        raise HTTPException(status_code=404, detail={"error": "Page not found."})
    return p, account


@public.get("/{slug}")
async def view_bio_page(slug: str, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    p, account = await _public_page(db, slug)
    if ratelimit.allow(f"bio-view:{slug}:{request.client.host if request.client else ''}", 3, 600):
        await db.execute(update(BioPage).where(BioPage.id == p.id).values(views=BioPage.views + 1))
        await db.commit()
    dm_url = None
    if p.dm_button_text and p.dm_ref_link_id:
        ref = await db.get(RefLink, p.dm_ref_link_id)
        dm_url = ref_url(account.username, ref.ref) if ref else None
    elif p.dm_button_text:
        dm_url = f"https://ig.me/m/{account.username}"
    return {"slug": p.slug, "title": p.title or account.name or account.username, "bio": p.bio, "username": account.username,
            "profile_picture_url": account.profile_picture_url, "links": [{"title": l["title"], "index": i} for i, l in enumerate(p.links or [])],
            "dm_button": {"text": p.dm_button_text, "url": dm_url} if dm_url else None}


@public.get("/{slug}/go/{index}", include_in_schema=False)
async def follow_bio_link(slug: str, index: int, request: Request, db: AsyncSession = Depends(get_db)) -> RedirectResponse:
    p, _ = await _public_page(db, slug)
    links = list(p.links or [])
    if not 0 <= index < len(links):
        raise HTTPException(status_code=404, detail={"error": "Link not found."})
    if ratelimit.allow(f"bio-click:{slug}:{index}:{request.client.host if request.client else ''}", 3, 600):
        links[index] = {**links[index], "clicks": int(links[index].get("clicks") or 0) + 1}
        p.links = links
        flag_modified(p, "links")
        await db.commit()
    return RedirectResponse(links[index]["url"], status_code=302, headers={"Cache-Control": "no-store"})
