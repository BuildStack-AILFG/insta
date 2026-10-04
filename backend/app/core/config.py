import hashlib
import hmac
import json
from functools import lru_cache
from typing import Annotated
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

_SSL_MODES_REQUIRING_TLS = {"require", "verify-ca", "verify-full"}


def _rewrite_driver(url: str, driver: str) -> str:
    """Swap the SQLAlchemy driver in a Postgres URL. Accepts postgres://, postgresql://, or postgresql+<driver>://."""
    scheme, sep, rest = url.partition("://")
    if not sep or not scheme.startswith(("postgres", "postgresql")):
        raise ValueError("DATABASE_URL must be a PostgreSQL URL (postgres:// or postgresql://).")
    return f"postgresql+{driver}://{rest}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"

    # Any provider-style URL works: postgres://…, postgresql://…, or postgresql+asyncpg://…
    database_url: str
    # Optional — derived from database_url when unset.
    database_url_sync: str = ""

    jwt_secret: str
    refresh_token_secret: str

    access_token_expires_minutes: int = 60 * 24 * 7  # 7 days, matches the reference product
    refresh_token_expires_days: int = 30

    encryption_key: str = ""

    # Public URL of this API, used to build webhook callback URLs and widget embed snippets shown in the UI.
    public_base_url: str = ""

    # Instagram API with Instagram Login (Meta app dashboard -> Instagram -> "API setup with Instagram business login").
    # The app id/secret power "Connect with Instagram" and verify webhook signatures; per-account tokens live encrypted in instagram_accounts.
    instagram_graph_base: str = "https://graph.instagram.com"
    instagram_oauth_base: str = "https://www.instagram.com"
    instagram_token_base: str = "https://api.instagram.com"
    graph_api_version: str = "v23.0"
    instagram_app_id: str = ""
    instagram_app_secret: str = ""
    instagram_webhook_verify_token: str = ""
    # Where Instagram sends people back after they approve access. Defaults to {frontend_url}/dashboard/instagram/callback,
    # and must be listed under "Valid OAuth Redirect URIs" in the Meta app exactly as sent.
    instagram_redirect_uri: str = ""

    # AI agent. Each workspace can bring its own key (stored encrypted); this is the platform fallback.
    anthropic_api_key: str = ""
    anthropic_api_base: str = "https://api.anthropic.com"
    ai_model: str = "claude-sonnet-5"

    # Media library: uploads are stored here and served at {public_base_url}/api/files/... so Instagram can download them.
    # Must be a persistent volume in production. A relative path is resolved from the backend folder.
    media_dir: str = "media_uploads"
    media_quota_mb: int = 2048  # per workspace

    # "Continue with Google" sign-in. The OAuth *Web* client id from Google Cloud Console; the button is hidden when unset.
    google_client_id: str = ""

    # Transactional email (invites, password reset). Optional — without it, invite/reset links are returned to the caller.
    resend_api_key: str = ""
    email_from: str = "GramForGrow <no-reply@gramforgrow.in>"
    # Base URL of the web app, used in emailed links. Defaults to the first non-localhost CORS origin, so production needs no extra setting.
    frontend_url: str = ""

    # Razorpay (our own subscription billing). Keys come from the Razorpay dashboard; webhook secret is optional but recommended.
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_api_base: str = "https://api.razorpay.com"
    billing_currency: str = "INR"
    gst_percent: int = 18
    # Seller details printed on invoices.
    company_name: str = "ScaleDesk Technology Pvt Ltd"
    company_gstin: str = ""
    company_address: str = ""
    company_email: str = ""
    # Where marketing-site contact / demo requests are emailed (optional; they are always stored).
    contact_notify_email: str = ""

    # In-process scheduler (flow waits, delayed replies, token refresh). See lib/PHASES.md — single instance only.
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 15

    # Comma-separated in the environment: CORS_ORIGINS=https://app.example.com,https://www.example.com
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000", "http://localhost:3001"]
    # Optional regex for dynamic origins, e.g. Vercel preview deploys: https://.*\.vercel\.app
    cors_origin_regex: str | None = None

    # Emails (comma-separated) that may open the platform admin console: PLATFORM_ADMIN_EMAILS=you@company.com,partner@company.com
    platform_admin_emails: Annotated[list[str], NoDecode] = []

    @field_validator("platform_admin_emails", mode="before")
    @classmethod
    def _split_admins(cls, v):
        if isinstance(v, str):
            v = json.loads(v) if v.strip().startswith("[") else v.split(",")
        return [e.strip().lower() for e in v if e.strip()]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, v):
        if isinstance(v, str):
            v = json.loads(v) if v.strip().startswith("[") else v.split(",")
        return [o.strip().rstrip("/") for o in v if o.strip()]

    @model_validator(mode="after")
    def _derive_urls(self):
        if not self.frontend_url:
            public = [o for o in self.cors_origins if "localhost" not in o and "127.0.0.1" not in o]
            self.frontend_url = (public or self.cors_origins or ["http://localhost:3000"])[0]
        if not self.database_url_sync:
            self.database_url_sync = _rewrite_driver(self.database_url, "psycopg")
        return self

    @property
    def webhook_verify_token(self) -> str:
        """INSTAGRAM_WEBHOOK_VERIFY_TOKEN, or a stable token derived from JWT_SECRET so the platform works with no extra setting."""
        if self.instagram_webhook_verify_token:
            return self.instagram_webhook_verify_token
        return "gfg-" + hmac.new(self.jwt_secret.encode(), b"instagram-webhook-verify", hashlib.sha256).hexdigest()[:32]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def async_database_url(self) -> str:
        """asyncpg URL with libpq-only params (sslmode) removed — asyncpg takes `ssl` via connect_args instead."""
        url = _rewrite_driver(self.database_url, "asyncpg")
        parts = urlsplit(url)
        query = [(k, v) for k, v in parse_qsl(parts.query) if k != "sslmode"]
        return urlunsplit(parts._replace(query=urlencode(query)))

    @property
    def database_requires_tls(self) -> bool:
        mode = dict(parse_qsl(urlsplit(self.database_url).query)).get("sslmode", "")
        return mode in _SSL_MODES_REQUIRING_TLS


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
