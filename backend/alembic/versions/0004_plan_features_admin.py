"""plan feature switches, platform settings, new price list

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-20 12:00:00

Adds `plans.features` / `plans.is_public` and the `platform_settings` table, and moves any *existing* plan rows onto the new price list and
feature switches once. From here on plans are edited in the admin console; the boot-time seed only inserts missing plans.
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.services.plan_catalog import PLANS

revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('plans', sa.Column('features', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('plans', sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table(
        'platform_settings',
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('value', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('key'),
    )

    plans = sa.table(
        'plans', sa.column('id', sa.String), sa.column('name', sa.String), sa.column('price_monthly', sa.Integer), sa.column('price_quarterly', sa.Integer),
        sa.column('price_yearly', sa.Integer), sa.column('quotas', sa.JSON), sa.column('features', sa.JSON), sa.column('is_public', sa.Boolean),
    )
    for p in PLANS:  # only rows that already exist are touched; the seed inserts the rest
        op.execute(plans.update().where(plans.c.id == p['id']).values(
            name=p['name'], price_monthly=p['price_monthly'], price_quarterly=p['price_quarterly'], price_yearly=p['price_yearly'],
            quotas=p['quotas'], features=p['features'], is_public=p['is_public'],
        ))


def downgrade() -> None:
    op.drop_table('platform_settings')
    op.drop_column('plans', 'is_public')
    op.drop_column('plans', 'features')
