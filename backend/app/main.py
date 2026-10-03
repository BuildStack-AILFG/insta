import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.admin import router as admin_router
from app.api.ai import router as ai_router
from app.api.analytics import router as analytics_router
from app.api.auth import router as auth_router
from app.api.billing import payments as payments_router
from app.api.billing import router as billing_router
from app.api.comment_automations import router as comment_automations_router
from app.api.contacts import router as contacts_router
from app.api.custom_replies import router as custom_replies_router
from app.api.developer import router as developer_router
from app.api.flows import router as flows_router
from app.api.giveaways import router as giveaways_router
from app.api.growth import public as bio_public_router
from app.api.growth import router as growth_router
from app.api.inbox import router as inbox_router
from app.api.insights import router as insights_router
from app.api.instagram import router as instagram_router
from app.api.integrations import hooks as hooks_router
from app.api.integrations import router as integrations_router
from app.api.links import router as links_router
from app.api.media import files as media_files_router
from app.api.media import router as media_router
from app.api.pipeline import router as pipeline_router
from app.api.posts import router as posts_router
from app.api.public import router as public_router
from app.api.public_api import router as public_api_router
from app.api.segments import router as segments_router
from app.api.settings import router as settings_router
from app.api.site import router as site_router
from app.api.team import router as team_router
from app.api.webhooks import router as webhooks_router
from app.api.workspace import router as workspace_router
from app.core.config import get_settings
from app.db import session as db_session
from app.services import outbound_webhooks, scheduler
from app.services.instagram import graph

settings = get_settings()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
# httpx logs every request URL at INFO, and Instagram token calls carry the app secret and access tokens in the query string.
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not settings.encryption_key:
        log.warning("ENCRYPTION_KEY is not set — connecting Instagram accounts / storing integration secrets will fail.")
    if settings.is_production and not settings.public_base_url:
        log.warning("PUBLIC_BASE_URL is not set — webhook URLs shown in the dashboard are derived from request headers.")
    scheduler.start()
    yield
    await scheduler.stop()
    await outbound_webhooks.drain()
    await graph.close_http()
    await db_session.engine.dispose()


app = FastAPI(
    title="GramForGrow API", version="1.0.0", lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs", redoc_url=None, openapi_url=None if settings.is_production else "/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth_router, contacts_router, instagram_router, comment_automations_router, giveaways_router, posts_router, media_router, insights_router, growth_router, flows_router, custom_replies_router, settings_router, workspace_router,
          inbox_router, segments_router, ai_router, developer_router, integrations_router, team_router, analytics_router, pipeline_router, billing_router, payments_router, admin_router):
    app.include_router(r, prefix="/api")
# Public surfaces (no login): Instagram webhooks, provider hooks, public plans/QR, tracked-link redirects, and the API-key REST API.
for r in (webhooks_router, hooks_router, public_router, public_api_router, site_router, links_router, bio_public_router, media_files_router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
async def health():
    """Liveness + database reachability (Railway health check)."""
    try:
        async with db_session.engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "unreachable"})
    return {"status": "ok"}
