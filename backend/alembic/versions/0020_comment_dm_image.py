"""Comment automations: optional image sent with the DM

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-24 20:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("comment_automations", sa.Column("dm_image_url", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("comment_automations", "dm_image_url")
