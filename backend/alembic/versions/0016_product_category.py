"""Shop products: a category the seller files them under (shown as filter chips on the storefront)

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-15 12:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shop_products", sa.Column("category", sa.String(60), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("shop_products", "category")
