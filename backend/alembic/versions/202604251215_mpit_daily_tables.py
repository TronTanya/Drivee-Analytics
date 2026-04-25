"""mpit_pass_daily / mpit_driver_daily: дневные агрегаты MPIT (pass_detail / driver_detail CSV).

Revision ID: 202604251215
Revises: 202604241800
Create Date: 2026-04-25 12:15:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "202604251215"
down_revision = "202604241800"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mpit_pass_daily",
        sa.Column("city_id", sa.Text(), nullable=False),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("order_date_part", sa.Date(), nullable=False),
        sa.Column("user_reg_date", sa.Date(), nullable=True),
        sa.Column("orders_count", sa.Numeric(18, 4), nullable=True),
        sa.Column("orders_cnt_with_tenders", sa.Numeric(18, 4), nullable=True),
        sa.Column("orders_cnt_accepted", sa.Numeric(18, 4), nullable=True),
        sa.Column("rides_count", sa.Numeric(18, 4), nullable=True),
        sa.Column("rides_time_sum_seconds", sa.Numeric(18, 4), nullable=True),
        sa.Column("online_time_sum_seconds", sa.Numeric(18, 4), nullable=True),
        sa.Column("client_cancel_after_accept", sa.Numeric(18, 4), nullable=True),
        sa.PrimaryKeyConstraint("city_id", "user_id", "order_date_part", name="pk_mpit_pass_daily"),
    )
    op.create_index("ix_mpit_pass_daily_city_date", "mpit_pass_daily", ["city_id", "order_date_part"], unique=False)

    op.create_table(
        "mpit_driver_daily",
        sa.Column("city_id", sa.Text(), nullable=False),
        sa.Column("driver_id", sa.Text(), nullable=False),
        sa.Column("tender_date_part", sa.Date(), nullable=False),
        sa.Column("driver_reg_date", sa.Date(), nullable=True),
        sa.Column("orders", sa.Numeric(18, 4), nullable=True),
        sa.Column("orders_cnt_with_tenders", sa.Numeric(18, 4), nullable=True),
        sa.Column("orders_cnt_accepted", sa.Numeric(18, 4), nullable=True),
        sa.Column("rides_count", sa.Numeric(18, 4), nullable=True),
        sa.Column("rides_time_sum_seconds", sa.Numeric(18, 4), nullable=True),
        sa.Column("online_time_sum_seconds", sa.Numeric(18, 4), nullable=True),
        sa.Column("client_cancel_after_accept", sa.Numeric(18, 4), nullable=True),
        sa.PrimaryKeyConstraint("city_id", "driver_id", "tender_date_part", name="pk_mpit_driver_daily"),
    )
    op.create_index(
        "ix_mpit_driver_daily_city_date", "mpit_driver_daily", ["city_id", "tender_date_part"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_mpit_driver_daily_city_date", table_name="mpit_driver_daily")
    op.drop_table("mpit_driver_daily")
    op.drop_index("ix_mpit_pass_daily_city_date", table_name="mpit_pass_daily")
    op.drop_table("mpit_pass_daily")
