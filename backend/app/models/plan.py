"""
Plan/quota schema — the Instagram-automation equivalent of the reference product's
lib/plans.js (PLAN_QUOTAS). A `plans` row is admin-curated, not user-generated,
so the primary key is a short text slug ('free', 'starter', ...) rather than a
UUID — simpler to reference in seed data and code (`plan_id == "free"`).
"""

from __future__ import annotations

from sqlalchemy import JSON, Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Plan(TimestampMixin, Base):
    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # 'free' | 'trial' | 'starter' | 'growth' | 'scale' | 'enterprise'
    name: Mapped[str] = mapped_column(String(64), nullable=False)

    price_monthly: Mapped[int | None] = mapped_column(Integer, nullable=True)  # smallest currency unit (e.g. paise); null = custom/enterprise
    price_quarterly: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_yearly: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Instagram-automation quotas (connected accounts, automations, contacts, AI replies).
    quotas: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        default=dict,
        comment=(
            "max_instagram_accounts, max_team_members, max_automation_flows, max_contacts, "
            "max_comment_automations, ai_replies_included_per_month, max_knowledge_sources"
        ),
    )

    # Feature switches, e.g. {"conversation_analytics": false}. A feature that is missing from this dict is ON, so a custom plan is never
    # locked by accident — see app/services/entitlements.py for the catalogue.
    features: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    # Hidden plans (e.g. the retired 'scale' tier) keep working for the workspaces on them but are not offered for sale.
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")

    is_default_trial: Mapped[bool] = mapped_column(Boolean, default=False)
