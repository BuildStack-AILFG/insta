"""Shop products: the home-page sections (best sellers, new arrivals) the seller puts them in

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-11 12:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shop_products", sa.Column("sections", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("shop_products", "sections")
