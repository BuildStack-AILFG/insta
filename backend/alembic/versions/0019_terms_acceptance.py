"""Record which Terms version each user accepted, when and from where

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-24 12:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("terms_version", sa.String(32), nullable=True))
    op.add_column("users", sa.Column("terms_accepted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("terms_accepted_ip", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("terms_accepted_user_agent", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "terms_accepted_user_agent")
    op.drop_column("users", "terms_accepted_ip")
    op.drop_column("users", "terms_accepted_at")
    op.drop_column("users", "terms_version")
