# DMForGrow backend

FastAPI + PostgreSQL backend for DMForGrow, an Instagram automation product: comment → DM automations, story
reply automation, a shared DM inbox, DM flows, an AI agent, a sales pipeline and payment links — on Meta's official
**Instagram API with Instagram Login**. It is a fork of the WhatsApp product in `../wap`, but runs fully separately
(own database, ports and secrets).

## Run it locally

From the repo root:

```
npm run dev
```

That starts (or creates) the `gramforgrow-db` Postgres container on **localhost:5434**, creates `.venv` with Python
3.12 and installs requirements on first run, applies migrations, seeds plans, and starts the API on **:8001** and the
frontend on **:3001**. `npm run kill` stops the API and frontend; the database container keeps running.

Copy `.env.example` to `.env` first if you don't have one — at minimum set `JWT_SECRET`, `REFRESH_TOKEN_SECRET` and
`ENCRYPTION_KEY` to long random values.

## Connecting Instagram

1. Create a Business-type app at developers.facebook.com and add **Instagram → API setup with Instagram business login**.
2. Set `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET` (Instagram → App settings) in `.env`.
3. Add `{FRONTEND_URL}/dashboard/instagram/callback` (or `INSTAGRAM_REDIRECT_URI`) to the app's OAuth redirect URIs.
4. Webhooks: callback `{PUBLIC_BASE_URL}/api/webhooks/instagram`, verify token = `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`;
   subscribe to comments, live_comments, messages, messaging_postbacks, messaging_seen, message_reactions,
   messaging_referral. Locally, expose :8001 with a tunnel (e.g. ngrok) and set `PUBLIC_BASE_URL` to it.
5. In the dashboard open **Instagram → Connect with Instagram** (or paste a tester token from the app dashboard).

Before other people's accounts can connect, request Advanced Access for `instagram_business_basic`,
`instagram_business_manage_comments` and `instagram_business_manage_messages` in App Review.

## What's in the platform

| Area | What it does |
|---|---|
| **Instagram** (`/api/instagram`) | OAuth login or token paste, encrypted long-lived tokens refreshed automatically, profile sync, webhook subscription, ice breakers, human-agent setting, post/reel picker |
| **Webhook** (`/api/webhooks/instagram`) | `X-Hub-Signature-256` verified, idempotent: DMs, echoes from the Instagram app, postbacks, quick replies, story replies/mentions, reactions, seen receipts, referrals, comments and live comments |
| **Comment automations** (`/api/comment-automations`) | Keyword / exact / any-comment matching with exclusions, specific / next / all posts, random public-reply variants, private-reply DM with link buttons, once-per-person, follow-up flow, per-comment activity log |
| **Inbox** (`/api/inbox`) | Conversations, polling, text / link buttons / media-by-URL, notes, assignment, labels, bot ↔ human, 24h window with optional 7-day HUMAN_AGENT tag |
| **Automation** | Welcome / away / delayed replies, keyword replies, flow engine (quick replies, link buttons, questions with validation, conditions, delays, webhooks, AI, handoff, deals, payment links), event and story-reply triggers |
| **Scheduler & media** (`/api/posts`, `/api/media`) | Photo / carousel / reel / story publishing, media library uploads (images normalised to Instagram's JPEG rules) served at `/api/files/...`, month calendar with drag-to-reschedule |
| **AI agent** (`/api/ai`) | Knowledge base (text, FAQ, website crawl), grounded replies via the Anthropic API, confidence-based handoff, lead qualification |
| **Developer** | API keys + REST API (`/api/v1`: DM by username/contact, contacts, events), signed outbound webhooks, Shopify / WooCommerce / Razorpay / Stripe / generic inbound hooks, Slack notifications |
| **Team & billing** | Roles, invitations, auto-assignment, analytics, notifications, Razorpay plan billing with GST invoices, sales pipeline, payment links |

Design notes: single process by design (see `lib/PHASES.md`). Background work (flow waits, delayed replies, token
refresh) runs in-process and elects one leader with a Postgres advisory lock.

## Testing

```
.venv/Scripts/python -m pip install -r requirements-dev.txt   # Windows; bin/python elsewhere
.venv/Scripts/python -m pytest
```

Tests create (and wipe) a `gramforgrow_test` database on the same server as `.env`'s `DATABASE_URL` — never wap's —
or use `TEST_DATABASE_URL`. A fake Instagram Graph API behind `httpx.MockTransport` stands in for Meta.

For a manual end-to-end run without a Meta app, start `uvicorn tests.fake_meta_server:app --port 9100`, run the API with
`INSTAGRAM_GRAPH_BASE=http://127.0.0.1:9100`, get a token from `GET :9100/__token` and paste it into "Use an access token".

## Deploying (Railway)

The repo ships a production `Dockerfile` and `railway.toml`. On every boot the container runs `alembic upgrade head`
and the idempotent plan seed, then serves on `$PORT`.

| Variable | Value |
|---|---|
| `DATABASE_URL` | the Postgres service's URL |
| `JWT_SECRET`, `REFRESH_TOKEN_SECRET` | two different long random strings |
| `ENCRYPTION_KEY` | a long random string — **required** to store Instagram tokens, AI keys and integration secrets; don't rotate it casually |
| `ENVIRONMENT` | `production` |
| `PUBLIC_BASE_URL` | the API's public https URL (webhook URL shown in the dashboard, and where Instagram downloads uploaded media) |
| `MEDIA_DIR` | path on a **persistent volume** for uploaded media (default `media_uploads` inside the app folder, which is lost on redeploy) |
| `CORS_ORIGINS` / `FRONTEND_URL` | the production frontend origin(s) |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` | from your Meta app |
| `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RAZORPAY_*` | optional (see `.env.example`) |

Then set `NEXT_PUBLIC_API_URL=https://<api-domain>/api` on the frontend host. Health check: `GET /api/health`.
