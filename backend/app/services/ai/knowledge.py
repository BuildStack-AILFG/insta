"""Knowledge base: ingest text/FAQ/web pages into chunks, retrieve with Postgres full-text search."""

from __future__ import annotations

import re
import uuid
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx
from sqlalchemy import delete, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.net import UnsafeUrl, assert_public_url
from app.models.knowledge import KnowledgeChunk, KnowledgeSource

CHUNK_CHARS = 900
CHUNK_OVERLAP = 120
MAX_SOURCE_CHARS = 200_000
MAX_CRAWL_PAGES = 8
_TOKEN = re.compile(r"[\w']{3,}", re.UNICODE)
_STOP = {"the", "and", "for", "with", "you", "your", "are", "was", "this", "that", "what", "how", "can", "does", "have", "has", "from", "will", "not", "but", "any", "all", "our", "out", "get"}


def chunk_text(content: str) -> list[str]:
    """Split on paragraph boundaries into ~900-char chunks with a small overlap so answers spanning a boundary survive."""
    content = re.sub(r"[ \t]+", " ", content.replace("\r", "")).strip()
    if not content:
        return []
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", content) if p.strip()]
    chunks: list[str] = []
    buf = ""
    for p in paragraphs:
        while len(p) > CHUNK_CHARS:  # a single huge paragraph: hard split on sentence-ish boundaries
            cut = p.rfind(". ", 0, CHUNK_CHARS)
            cut = cut + 1 if cut > CHUNK_CHARS // 2 else CHUNK_CHARS
            if buf:
                chunks.append(buf)
                buf = ""
            chunks.append(p[:cut].strip())
            p = p[max(cut - CHUNK_OVERLAP, 0):].strip() if cut > CHUNK_OVERLAP else p[cut:].strip()
        if len(buf) + len(p) + 2 <= CHUNK_CHARS:
            buf = f"{buf}\n\n{p}".strip()
        else:
            if buf:
                chunks.append(buf)
            buf = p
    if buf:
        chunks.append(buf)
    return [c for c in chunks if c.strip()]


class _Text(HTMLParser):
    SKIP = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "iframe"}
    BLOCK = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "section", "article"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.links: list[str] = []
        self._skip = 0
        self.title = ""
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self._skip += 1
        if tag == "title":
            self._in_title = True
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self._skip:
            self._skip -= 1
        if tag == "title":
            self._in_title = False
        if tag in self.BLOCK:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        elif not self._skip and data.strip():
            self.parts.append(data.strip() + " ")


def html_to_text(html: str) -> tuple[str, str, list[str]]:
    p = _Text()
    p.feed(html)
    body = re.sub(r"\n\s*\n\s*\n+", "\n\n", "".join(p.parts)).strip()
    return p.title.strip(), body, p.links


async def _store(db: AsyncSession, tenant_id: uuid.UUID, source: KnowledgeSource, chunks: list[str]) -> None:
    for c in chunks:
        db.add(KnowledgeChunk(tenant_id=tenant_id, source_id=source.id, content=c))
    source.chunk_count = len(chunks)


async def add_text(db: AsyncSession, tenant_id: uuid.UUID, title: str, content: str, kind: str = "text") -> KnowledgeSource:
    chunks = chunk_text(content[:MAX_SOURCE_CHARS])
    source = KnowledgeSource(tenant_id=tenant_id, kind=kind, title=title[:300], status="ready" if chunks else "failed", error=None if chunks else "No text to index.")
    db.add(source)
    await db.flush()
    await _store(db, tenant_id, source, chunks)
    await db.commit()
    return source


async def add_faq(db: AsyncSession, tenant_id: uuid.UUID, items: list[dict]) -> KnowledgeSource:
    """items: [{question, answer}] — each pair becomes one chunk so a question retrieves its own answer intact."""
    chunks = [f"Q: {i['question'].strip()}\nA: {i['answer'].strip()}" for i in items if i.get("question", "").strip() and i.get("answer", "").strip()]
    source = KnowledgeSource(tenant_id=tenant_id, kind="faq", title=f"FAQ ({len(chunks)} entries)", status="ready" if chunks else "failed", error=None if chunks else "No complete Q&A pairs.")
    db.add(source)
    await db.flush()
    await _store(db, tenant_id, source, chunks)
    await db.commit()
    return source


async def add_url(db: AsyncSession, tenant_id: uuid.UUID, url: str, crawl: bool = True) -> KnowledgeSource:
    """Fetch a public page (and a few same-site links) and index the visible text."""
    source = KnowledgeSource(tenant_id=tenant_id, kind="url", title=url[:300], source_url=url, status="ready")
    db.add(source)
    await db.flush()
    try:
        assert_public_url(url)
        pages: list[tuple[str, str]] = []
        seen: set[str] = set()
        queue = [url]
        async with httpx.AsyncClient(timeout=15, follow_redirects=False, headers={"User-Agent": "LeadForGrowBot/1.0"}) as http:
            while queue and len(pages) < (MAX_CRAWL_PAGES if crawl else 1):
                current = queue.pop(0)
                if current in seen:
                    continue
                seen.add(current)
                assert_public_url(current)
                resp = await http.get(current)
                if resp.status_code in {301, 302, 303, 307, 308} and resp.headers.get("location"):
                    queue.insert(0, urljoin(current, resp.headers["location"]))
                    continue
                if resp.status_code >= 400 or "html" not in resp.headers.get("content-type", "text/html"):
                    continue
                title, body, links = html_to_text(resp.text[:1_000_000])
                if body:
                    pages.append((title or current, body))
                if crawl:
                    host = urlsplit(url).netloc
                    for href in links:
                        absolute = urljoin(current, href).split("#")[0]
                        if urlsplit(absolute).netloc == host and absolute not in seen and absolute.startswith("http") and not re.search(r"\.(png|jpe?g|gif|svg|pdf|zip|css|js)$", absolute, re.I):
                            queue.append(absolute)
        if not pages:
            raise ValueError("No readable text found at that URL.")
        source.title = (pages[0][0] or url)[:300]
        chunks: list[str] = []
        for title, body in pages:
            chunks.extend(chunk_text(f"{title}\n\n{body}"))
        await _store(db, tenant_id, source, chunks[:400])
    except (UnsafeUrl, httpx.HTTPError, ValueError) as exc:
        source.status, source.error = "failed", str(exc)[:300]
    await db.commit()
    return source


async def delete_source(db: AsyncSession, tenant_id: uuid.UUID, source_id: uuid.UUID) -> bool:
    source = await db.get(KnowledgeSource, source_id)
    if source is None or source.tenant_id != tenant_id:
        return False
    await db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.source_id == source_id))
    await db.delete(source)
    await db.commit()
    return True


def _query_tokens(query: str) -> list[str]:
    seen, out = set(), []
    for t in _TOKEN.findall(query.lower()):
        t = re.sub(r"[^\w]", "", t)
        if t and t not in _STOP and t not in seen:
            seen.add(t)
            out.append(t)
    return out[:12]


async def retrieve(db: AsyncSession, tenant_id: uuid.UUID, query: str, k: int = 5) -> list[str]:
    """Best-matching chunks for a question. OR-matches the meaningful words and ranks by relevance."""
    tokens = _query_tokens(query)
    if not tokens:
        return []
    tsquery = " | ".join(tokens)
    rows = await db.execute(
        select(KnowledgeChunk.content, func.ts_rank_cd(KnowledgeChunk.search_vector, func.to_tsquery("simple", tsquery)).label("rank"))
        .where(KnowledgeChunk.tenant_id == tenant_id, KnowledgeChunk.search_vector.op("@@")(func.to_tsquery("simple", tsquery)))
        .order_by(text("rank DESC")).limit(k)
    )
    return [r[0] for r in rows]


async def count_sources(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    return (await db.execute(select(func.count()).select_from(KnowledgeSource).where(KnowledgeSource.tenant_id == tenant_id))).scalar_one()
