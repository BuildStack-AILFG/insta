from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class Tenant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A business/workspace — the top-level tenant everything else is scoped under."""

    __tablename__ = "tenants"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="active")  # active|suspended|deleted

    plan_id: Mapped[str] = mapped_column(String(32), ForeignKey("plans.id"), nullable=False, default="trial")
    quotas_override: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # End of the paid period bought through Razorpay. A paid plan past this date is downgraded to free by the scheduler.
    plan_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # business_hours{}, ai{tone,personality,...} — read as one blob, rarely queried by field.
    settings: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    memberships: Mapped[list["TenantMembership"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A login — global, can belong to multiple tenants (agencies) via TenantMembership."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)  # null only for OAuth-only users
    full_name: Mapped[str | None] = mapped_column(String(200), nullable=True)

    auth_provider: Mapped[str] = mapped_column(String(32), default="local")  # local|google

    must_rotate_password: Mapped[bool] = mapped_column(Boolean, default=False)
    password_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    reset_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    reset_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    memberships: Mapped[list["TenantMembership"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class TenantMembership(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Join table: which tenants a user belongs to, and their role in each."""

    __tablename__ = "tenant_memberships"
    __table_args__ = (UniqueConstraint("tenant_id", "user_id", name="uq_tenant_memberships_tenant_user"),)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="owner")  # owner|admin|agent|viewer

    tenant: Mapped[Tenant] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")
