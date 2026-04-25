"""Drivee incity dataset: incity_orders + passenger/driver daily metrics (замена mpit_*).

Revision ID: 202604251630
Revises: 202604251215
Create Date: 2026-04-25 16:30:00.000000
"""

from __future__ import annotations

from alembic import op

revision = "202604251630"
down_revision = "202604251215"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.mpit_driver_daily CASCADE")
    op.execute("DROP TABLE IF EXISTS public.mpit_pass_daily CASCADE")

    op.execute(
        """
        CREATE TABLE public.incity_orders (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            city_id TEXT NOT NULL,
            offset_hours INTEGER NOT NULL,
            order_id TEXT NOT NULL,
            tender_id TEXT,
            user_id TEXT NOT NULL,
            driver_id TEXT NOT NULL,
            status_order TEXT NOT NULL,
            status_tender TEXT NOT NULL,
            order_timestamp TIMESTAMPTZ,
            tender_timestamp TIMESTAMPTZ,
            driveraccept_timestamp TIMESTAMPTZ,
            driverarrived_timestamp TIMESTAMPTZ,
            driverstarttheride_timestamp TIMESTAMPTZ,
            driverdone_timestamp TIMESTAMPTZ,
            clientcancel_timestamp TIMESTAMPTZ,
            drivercancel_timestamp TIMESTAMPTZ,
            order_modified_local TIMESTAMPTZ,
            cancel_before_accept_local TIMESTAMPTZ,
            distance_in_meters BIGINT,
            duration_in_seconds BIGINT,
            price_order_local NUMERIC(18, 4),
            price_tender_local NUMERIC(18, 4),
            price_start_local NUMERIC(18, 4),
            order_channel TEXT NOT NULL DEFAULT 'unknown'
        );
        """
    )
    op.execute("CREATE INDEX ix_incity_orders_city_id ON public.incity_orders (city_id);")
    op.execute("CREATE INDEX ix_incity_orders_order_id ON public.incity_orders (order_id);")
    op.execute("CREATE INDEX ix_incity_orders_tender_id ON public.incity_orders (tender_id);")
    op.execute("CREATE INDEX ix_incity_orders_user_id ON public.incity_orders (user_id);")
    op.execute("CREATE INDEX ix_incity_orders_driver_id ON public.incity_orders (driver_id);")
    op.execute("CREATE INDEX ix_incity_orders_order_ts ON public.incity_orders (order_timestamp);")
    op.execute("CREATE INDEX ix_incity_orders_tender_ts ON public.incity_orders (tender_timestamp);")
    op.execute("CREATE INDEX ix_incity_orders_driverdone ON public.incity_orders (driverdone_timestamp);")
    op.execute("CREATE INDEX ix_incity_orders_clientcancel ON public.incity_orders (clientcancel_timestamp);")
    op.execute("CREATE INDEX ix_incity_orders_channel ON public.incity_orders (order_channel);")

    op.execute(
        """
        CREATE TABLE public.passenger_daily_metrics (
            city_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            order_date_part DATE NOT NULL,
            user_reg_date DATE,
            orders_count NUMERIC(18, 4),
            orders_cnt_with_tenders NUMERIC(18, 4),
            orders_cnt_accepted NUMERIC(18, 4),
            rides_count NUMERIC(18, 4),
            client_cancel_after_accept NUMERIC(18, 4),
            rides_time_sum_seconds NUMERIC(18, 4),
            online_time_sum_seconds NUMERIC(18, 4),
            PRIMARY KEY (city_id, user_id, order_date_part)
        );
        """
    )
    op.execute("CREATE INDEX ix_pass_dm_user ON public.passenger_daily_metrics (user_id);")
    op.execute("CREATE INDEX ix_pass_dm_city ON public.passenger_daily_metrics (city_id);")
    op.execute("CREATE INDEX ix_pass_dm_date ON public.passenger_daily_metrics (order_date_part);")
    op.execute(
        "CREATE INDEX ix_pass_dm_city_date ON public.passenger_daily_metrics (city_id, order_date_part);"
    )
    op.execute(
        "CREATE INDEX ix_pass_dm_user_date ON public.passenger_daily_metrics (user_id, order_date_part);"
    )

    op.execute(
        """
        CREATE TABLE public.driver_daily_metrics (
            city_id TEXT NOT NULL,
            driver_id TEXT NOT NULL,
            tender_date_part DATE NOT NULL,
            driver_reg_date DATE,
            orders NUMERIC(18, 4),
            orders_cnt_with_tenders NUMERIC(18, 4),
            orders_cnt_accepted NUMERIC(18, 4),
            rides_count NUMERIC(18, 4),
            client_cancel_after_accept NUMERIC(18, 4),
            rides_time_sum_seconds NUMERIC(18, 4),
            online_time_sum_seconds NUMERIC(18, 4),
            PRIMARY KEY (city_id, driver_id, tender_date_part)
        );
        """
    )
    op.execute("CREATE INDEX ix_drv_dm_driver ON public.driver_daily_metrics (driver_id);")
    op.execute("CREATE INDEX ix_drv_dm_city ON public.driver_daily_metrics (city_id);")
    op.execute("CREATE INDEX ix_drv_dm_date ON public.driver_daily_metrics (tender_date_part);")
    op.execute(
        "CREATE INDEX ix_drv_dm_city_date ON public.driver_daily_metrics (city_id, tender_date_part);"
    )
    op.execute(
        "CREATE INDEX ix_drv_dm_driver_date ON public.driver_daily_metrics (driver_id, tender_date_part);"
    )

    op.execute(
        """
        DELETE FROM query_templates
        WHERE template_key IN (
            'admin_mpit_pass_avg_orders_by_city',
            'admin_mpit_driver_rides_sum_by_city'
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS public.driver_daily_metrics CASCADE")
    op.execute("DROP TABLE IF EXISTS public.passenger_daily_metrics CASCADE")
    op.execute("DROP TABLE IF EXISTS public.incity_orders CASCADE")
    # Восстановление mpit_* не выполняем — откат только удаления новых таблиц.
