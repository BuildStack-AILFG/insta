"""instagram platform: replace the WhatsApp channel with Instagram

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-26 12:00:00

GramForGrow is forked from the WhatsApp product. This migration removes the WhatsApp-only surfaces (numbers, templates,
broadcasts, the commerce catalog and the website chat widget), adds connected Instagram accounts, comment automations and the
comment log, and re-points conversations/contacts/messages at Instagram identities.

Existing conversations belong to WhatsApp numbers that no longer exist, so they are deleted (their messages cascade).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)
OLD_QUOTAS = {"max_whatsapp_numbers": "max_instagram_accounts", "max_broadcast_recipients_per_month": "max_comment_automations"}


def upgrade() -> None:
    # ---- drop the WhatsApp-only features -------------------------------------------------------------------------
    op.execute("DELETE FROM conversations")
    op.drop_constraint("conversations_account_id_fkey", "conversations", type_="foreignkey")
    for table in ("broadcast_recipients", "broadcasts", "whatsapp_templates", "commerce_orders", "products", "commerce_settings", "widgets", "whatsapp_accounts"):
        op.drop_table(table)

    # ---- connected Instagram accounts ----------------------------------------------------------------------------
    op.create_table(
        "instagram_accounts",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ig_user_id", sa.String(64), nullable=False),
        sa.Column("app_scoped_id", sa.String(64), nullable=True),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=True),
        sa.Column("account_type", sa.String(32), nullable=True),
        sa.Column("profile_picture_url", sa.Text(), nullable=True),
        sa.Column("followers_count", sa.Integer(), nullable=True),
        sa.Column("media_count", sa.Integer(), nullable=True),
        sa.Column("access_token_enc", sa.Text(), nullable=False),
        sa.Column("token_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("scopes", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("webhooks_subscribed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("connection_type", sa.String(16), nullable=False, server_default="oauth"),
        sa.Column("status", sa.String(16), nullable=False, server_default="connected"),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("last_webhook_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settings", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("ig_user_id", name="uq_instagram_accounts_ig_user_id"),
    )
    op.create_index("ix_instagram_accounts_tenant_id", "instagram_accounts", ["tenant_id"])

    # ---- conversations / messages / contacts ---------------------------------------------------------------------
    op.create_foreign_key("conversations_account_id_fkey", "conversations", "instagram_accounts", ["account_id"], ["id"], ondelete="CASCADE")
    op.drop_column("conversations", "free_entry_until")

    op.drop_index("ix_messages_wamid", table_name="messages")
    op.alter_column("messages", "wamid", new_column_name="external_id", type_=sa.String(255))
    op.create_index("ix_messages_external_id", "messages", ["external_id"])
    op.alter_column("messages", "media_id", new_column_name="media_url", type_=sa.Text())
    op.drop_column("messages", "broadcast_id")

    op.alter_column("contacts", "phone", existing_type=sa.String(32), nullable=True)
    op.add_column("contacts", sa.Column("ig_user_id", sa.String(64), nullable=True))
    op.add_column("contacts", sa.Column("ig_username", sa.String(100), nullable=True))
    op.add_column("contacts", sa.Column("profile_pic_url", sa.Text(), nullable=True))
    op.add_column("contacts", sa.Column("follower_count", sa.Integer(), nullable=True))
    op.add_column("contacts", sa.Column("is_follower", sa.Boolean(), nullable=True))
    op.create_unique_constraint("uq_contacts_tenant_ig_user", "contacts", ["tenant_id", "ig_user_id"])
    op.create_index("ix_contacts_ig_username", "contacts", ["ig_username"])

    # ---- comment automations + comment log ----------------------------------------------------------------------
    op.create_table(
        "comment_automations",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID, sa.ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("media_scope", sa.String(16), nullable=False, server_default="specific"),
        sa.Column("media_ids", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("media_preview", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("match_type", sa.String(16), nullable=False, server_default="contains"),
        sa.Column("keywords", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("exclude_keywords", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("public_reply_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("public_replies", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("dm_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("dm_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("dm_buttons", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("flow_id", UUID, sa.ForeignKey("automation_flows.id", ondelete="SET NULL"), nullable=True),
        sa.Column("once_per_user", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("comments_matched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("public_replies_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("dms_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_comment_automations_tenant_id", "comment_automations", ["tenant_id"])
    op.create_index("ix_comment_automations_account_id", "comment_automations", ["account_id"])

    op.create_table(
        "instagram_comments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("tenant_id", UUID, sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", UUID, sa.ForeignKey("instagram_accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("comment_id", sa.String(64), nullable=False, unique=True),
        sa.Column("parent_id", sa.String(64), nullable=True),
        sa.Column("media_id", sa.String(64), nullable=True),
        sa.Column("media_product_type", sa.String(16), nullable=True),
        sa.Column("from_ig_id", sa.String(64), nullable=True),
        sa.Column("from_username", sa.String(100), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("is_live", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("contact_id", UUID, sa.ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("automation_id", UUID, sa.ForeignKey("comment_automations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("outcome", sa.String(24), nullable=False, server_default="no_match"),
        sa.Column("public_reply_id", sa.String(64), nullable=True),
        sa.Column("dm_message_id", sa.String(128), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_instagram_comments_media_id", "instagram_comments", ["media_id"])
    op.create_index("ix_instagram_comments_tenant_created", "instagram_comments", ["tenant_id", "created_at"])
    op.create_index("ix_instagram_comments_automation_author", "instagram_comments", ["automation_id", "from_ig_id"])

    # ---- plans: rename the channel-specific quota keys and the reports feature ----------------------------------
    for old, new in OLD_QUOTAS.items():
        op.execute(sa.text(
            "UPDATE plans SET quotas = ((quotas::jsonb - :old) || jsonb_build_object(:new, quotas::jsonb -> :old))::json WHERE quotas::jsonb ? :old"
        ).bindparams(old=old, new=new))
    op.execute(sa.text(
        "UPDATE plans SET features = ((features::jsonb - 'campaign_reports') || jsonb_build_object('automation_reports', features::jsonb -> 'campaign_reports'))::json "
        "WHERE features::jsonb ? 'campaign_reports'"
    ))
    op.alter_column("plans", "quotas", existing_type=sa.JSON(), comment=(
        "max_instagram_accounts, max_team_members, max_automation_flows, max_contacts, "
        "max_comment_automations, ai_replies_included_per_month, max_knowledge_sources"
    ))
    # Broadcast recipient volumes (thousands) make no sense as an automation count; fall back to the catalogue defaults.
    for plan_id, n in (("free", 2), ("trial", 5), ("starter", 20), ("growth", 100), ("scale", 500)):
        op.execute(sa.text(
            "UPDATE plans SET quotas = (quotas::jsonb || jsonb_build_object('max_comment_automations', CAST(:n AS int)))::json WHERE id = :id"
        ).bindparams(n=n, id=plan_id))


def downgrade() -> None:
    raise NotImplementedError("0006 removes the WhatsApp channel; restore from a backup taken before upgrading instead.")
