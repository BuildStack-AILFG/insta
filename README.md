# GramForGrow

Instagram comment → DM automation, shared DM inbox, flows and an AI agent, built on Meta's official Instagram API with
Instagram Login. Live at [gramforgrow.in](https://gramforgrow.in).

| Part | Stack | Docs |
|---|---|---|
| `backend/` | FastAPI, async SQLAlchemy, Postgres, Alembic | [backend/README.md](backend/README.md) |
| `frontend/` | Next.js, React, Tailwind | [frontend/README.md](frontend/README.md) |
| `docs/` | Meta App Review guide | [docs/meta-app-review.md](docs/meta-app-review.md) |

## Run locally

```
npm run dev     # Postgres container on :5434, API on :8001, frontend on :3001
npm run kill    # stop API + frontend (the database container keeps running)
```

Copy `backend/.env.example` → `backend/.env` and `frontend/.env.example` → `frontend/.env.local` first.

## Tests

```
cd backend && .venv/Scripts/python -m pytest      # needs the Postgres container running
cd frontend && npm run lint && npx tsc --noEmit
```

CI (`.github/workflows/ci.yml`) runs both on every push to `main` and on every pull request.

## Deploy

- **API:** Railway (`backend/Dockerfile`, `backend/railway.toml`). Migrations run on deploy.
- **Frontend:** Vercel.
- **Email:** Resend. **DNS:** Hostinger.

Optional production settings: `SENTRY_DSN` (error monitoring) and `TRUSTED_PROXY_HOPS` (default `1`: Railway's edge proxy).
Webhook follow-up work is stored in the `jobs` table; failed jobs can be viewed and retried at `GET/POST /api/admin/jobs`.
