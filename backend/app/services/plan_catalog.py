"""
The plan catalogue: prices, quotas and feature switches for every plan.

Prices are INR paise *per month* for each billing period. This is only the starting point: `scripts/seed_plans.py` inserts plans that are
missing, and migration 0004 moves existing databases onto it once. After that the platform admin edits plans in the admin console, so
re-deploying never overwrites them. `frontend/src/lib/site/plans.ts` holds the same numbers as a fallback for the public site.

Commercial model (modelled on Interakt): the trial is the full product with very limited outbound messaging and a few advanced features
locked. Every paid plan unlocks every feature and differs only in volume, so upgrading is a question of "how much", never "which features".
"""

from __future__ import annotations

# Feature switches an admin can flip per plan. A feature missing from a plan's `features` dict is ON.
FEATURES: dict[str, dict[str, str]] = {
    "ai_agent": {"label": "AI agent", "blurb": "Answers customers automatically from your knowledge base."},
    "conversation_analytics": {"label": "Conversation analytics", "blurb": "Response times, volumes and agent performance."},
    "automation_reports": {"label": "Automation reports", "blurb": "Comments matched, DMs sent and clicks for every automation."},
    "sales_reports": {"label": "Sales reports", "blurb": "Pipeline, win-rate and revenue reports."},
    "assignment_rules": {"label": "Auto-assignment rules", "blurb": "Route new chats to the right teammate automatically."},
    "api_access": {"label": "API keys & webhooks", "blurb": "Sync contacts and receive events in your own systems."},
    "integrations": {"label": "App integrations", "blurb": "Shopify, WooCommerce, Razorpay and other event triggers."},
}

TRIAL_DAYS_DEFAULT = 14

_UNLIMITED = 999999
_ALL_ON = {k: True for k in FEATURES}
# Locked on the trial and on the free plan a lapsed trial falls back to. The AI agent deliberately stays on for the trial.
_TRIAL_FEATURES = {**_ALL_ON, "conversation_analytics": False, "automation_reports": False, "sales_reports": False, "assignment_rules": False,
                   "api_access": False, "integrations": False}
_FREE_FEATURES = {**_TRIAL_FEATURES, "ai_agent": False}

PLANS: list[dict] = [
    {
        "id": "free", "name": "Free", "price_monthly": None, "price_quarterly": None, "price_yearly": None, "is_default_trial": False, "is_public": False,
        "features": _FREE_FEATURES,
        "quotas": {"max_instagram_accounts": 1, "max_team_members": 1, "max_automation_flows": 1, "max_contacts": 200, "max_comment_automations": 2,
                   "ai_replies_included_per_month": 0, "max_knowledge_sources": 0},
    },
    {
        "id": "trial", "name": "Free trial", "price_monthly": None, "price_quarterly": None, "price_yearly": None, "is_default_trial": True, "is_public": False,
        "features": _TRIAL_FEATURES,
        "quotas": {"max_instagram_accounts": 1, "max_team_members": 3, "max_automation_flows": 5, "max_contacts": 1000, "max_comment_automations": 5,
                   "ai_replies_included_per_month": 200, "max_knowledge_sources": 2},
    },
    {
        "id": "starter", "name": "Starter", "price_monthly": 79900, "price_quarterly": 71900, "price_yearly": 63900, "is_default_trial": False, "is_public": True,
        "features": _ALL_ON,
        "quotas": {"max_instagram_accounts": 1, "max_team_members": 3, "max_automation_flows": 5, "max_contacts": 2000, "max_comment_automations": 20,
                   "ai_replies_included_per_month": 500, "max_knowledge_sources": 3},
    },
    {
        "id": "growth", "name": "Growth", "price_monthly": 129900, "price_quarterly": 116900, "price_yearly": 103900, "is_default_trial": False, "is_public": True,
        "features": _ALL_ON,
        "quotas": {"max_instagram_accounts": 3, "max_team_members": 8, "max_automation_flows": 20, "max_contacts": 10000, "max_comment_automations": 100,
                   "ai_replies_included_per_month": 2000, "max_knowledge_sources": 10},
    },
    {   # Retired tier: hidden from sale, still honoured for workspaces that bought it.
        "id": "scale", "name": "Scale", "price_monthly": 599900, "price_quarterly": 539900, "price_yearly": 479900, "is_default_trial": False, "is_public": False,
        "features": _ALL_ON,
        "quotas": {"max_instagram_accounts": 10, "max_team_members": 20, "max_automation_flows": 50, "max_contacts": 50000, "max_comment_automations": 500,
                   "ai_replies_included_per_month": 10000, "max_knowledge_sources": 25},
    },
    {
        "id": "enterprise", "name": "Enterprise", "price_monthly": None, "price_quarterly": None, "price_yearly": None, "is_default_trial": False, "is_public": True,
        "features": _ALL_ON,
        "quotas": {k: _UNLIMITED for k in ("max_instagram_accounts", "max_team_members", "max_automation_flows", "max_contacts", "max_comment_automations",
                                           "ai_replies_included_per_month", "max_knowledge_sources")},
    },
]
