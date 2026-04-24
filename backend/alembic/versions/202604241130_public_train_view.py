"""public.train view over anonymized_incity_orders

Revision ID: 202604241130
Revises: 202604211740
Create Date: 2026-04-24 11:30:00.000000
"""

from __future__ import annotations

from alembic import op

revision = "202604241130"
down_revision = "202604211740"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE OR REPLACE VIEW public.train AS
        SELECT * FROM public.anonymized_incity_orders
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS public.train")
