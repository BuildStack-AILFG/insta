FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

RUN adduser --disabled-password --gecos "" app && chown -R app:app /app
USER app

EXPOSE 8000

# Migrate + seed plans (idempotent upsert) on every boot, then serve. $PORT is injected by the host.
CMD ["sh", "-c", "alembic upgrade head && python scripts/seed_plans.py && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
