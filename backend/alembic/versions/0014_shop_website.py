"""Shop website: storefront settings (colours, texts, hero carousel, about, FAQ), custom domains and extra product photos

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-08 20:00:00
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("shops", sa.Column("site", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("shops", sa.Column("custom_domain", sa.String(253), nullable=True))
    op.add_column("shops", sa.Column("domain_status", sa.String(16), nullable=False, server_default="none"))
    op.add_column("shops", sa.Column("domain_checked_at", sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint("uq_shops_custom_domain", "shops", ["custom_domain"])
    op.add_column("shop_products", sa.Column("images", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("shop_products", "images")
    op.drop_constraint("uq_shops_custom_domain", "shops", type_="unique")
    for col in ("domain_checked_at", "domain_status", "custom_domain", "site"):
        op.drop_column("shops", col)
