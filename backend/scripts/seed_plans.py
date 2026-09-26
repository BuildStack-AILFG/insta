"""
Seed the `plans` table. Insert-only: a plan that already exists is left alone, because the platform admin edits plans in the admin console
and a redeploy (this runs on every boot) must not overwrite those edits. New defaults reach existing databases through a migration.

Run once after migrations: python scripts/seed_plans.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.plan import Plan
from app.models.platform import PlatformSetting
from app.services.plan_catalog import PLANS, TRIAL_DAYS_DEFAULT

TRIAL_DAYS_KEY = "trial_days"


def main() -> None:
    engine = create_engine(get_settings().database_url_sync)
    added = 0
    with Session(engine) as session:
        for data in PLANS:
            if session.get(Plan, data["id"]) is None:
                session.add(Plan(**data))
                added += 1
        if session.get(PlatformSetting, TRIAL_DAYS_KEY) is None:
            session.add(PlatformSetting(key=TRIAL_DAYS_KEY, value={"v": TRIAL_DAYS_DEFAULT}))
        session.commit()
    print(f"Plans ready ({added} added, {len(PLANS) - added} already present).")


if __name__ == "__main__":
    main()
