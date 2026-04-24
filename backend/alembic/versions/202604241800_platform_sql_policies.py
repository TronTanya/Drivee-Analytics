"""platform_sql_policies: админские расширения whitelist SQL и лимит строк.

Revision ID: 202604241800
Revises: 202604241130
Create Date: 2026-04-24 18:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "202604241800"
down_revision = "202604241130"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platform_sql_policies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "extra_whitelist_tables",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "extra_whitelist_columns",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("nl_max_result_rows", sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        """
        INSERT INTO platform_sql_policies (id, extra_whitelist_tables, extra_whitelist_columns, nl_max_result_rows)
        SELECT 1, '[]'::jsonb, '[]'::jsonb, NULL
        WHERE NOT EXISTS (SELECT 1 FROM platform_sql_policies WHERE id = 1)
        """
    )


def downgrade() -> None:
    op.drop_table("platform_sql_policies")
