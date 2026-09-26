from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class PlanOut(BaseModel):
    id: str
    name: str
    price_monthly: int | None
    price_quarterly: int | None
    price_yearly: int | None
    is_default_trial: bool
    quotas: dict


class MemberOut(BaseModel):
    user_id: uuid.UUID
    email: str
    full_name: str | None
    role: str


class WorkspaceDetail(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan: PlanOut
    quotas: dict  # plan quotas with any per-tenant override applied
    usage: dict  # {contacts, automation_flows, team_members} — live counts
    trial_ends_at: str | None
    members: list[MemberOut]
    my_role: str | None


class WorkspaceUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
