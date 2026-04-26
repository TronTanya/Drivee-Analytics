"""Template-based SQL generation per intent (rules first)."""

from __future__ import annotations

import re
from typing import Any, Optional

from app.services.sql_validation.effective_sql_settings import get_effective_sql_settings
from app.schemas.orchestration import IntentKind


class SQLGenerationService:
    SOURCE_TABLE = "incity_orders"

    @staticmethod
    def _resolve_source_table(source_table: Optional[str]) -> str:
        """Таблицы из whitelist по basename или staging `schema.t_*` из настроек."""
        cfg = get_effective_sql_settings()
        allowed = {t.lower() for t in cfg.sql_whitelist_tables}
        default = SQLGenerationService.SOURCE_TABLE
        if not source_table:
            return default
        candidate = source_table.strip().lower()
        if not re.fullmatch(r"[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?", candidate):
            return default
        parts = candidate.split(".")
        if len(parts) == 2:
            schema, base = parts[0], parts[1]
        else:
            schema = (cfg.sql_implicit_schema or "public").strip().lower()
            base = parts[0]
        staging_schema = (cfg.csv_staging_schema or "user_staging").strip().lower()
        pat = getattr(cfg, "sql_staging_upload_table_pattern", r"^t_[a-f0-9]{12}$") or r"^t_[a-f0-9]{12}$"
        try:
            staging_re = re.compile(pat, re.IGNORECASE)
        except re.error:
            staging_re = re.compile(r"^t_[a-f0-9]{12}$", re.IGNORECASE)
        if schema == staging_schema and staging_re.fullmatch(base):
            return f"{schema}.{base}"
        if base not in allowed:
            return default
        return candidate

    def build_where_orders(self, entities: dict[str, Any], workspace_id: Optional[str]) -> str:
        parts: list[str] = ["1=1"]
        # Source table is anonymized raw dataset and does not include workspace_id.
        _ = workspace_id
        if entities.get("city_id"):
            parts.append(f"a.city_id::text = '{entities['city_id']}'")
        if entities.get("city"):
            parts.append(f"a.city_id::text = '{entities['city']}'")
        if entities.get("status_order"):
            parts.append(f"a.status_order::text = '{entities['status_order']}'")
        if entities.get("status_tender"):
            parts.append(f"a.status_tender::text = '{entities['status_tender']}'")
        if entities.get("order_channel"):
            parts.append(f"a.order_channel::text = '{entities['order_channel']}'")
        if entities.get("user_id"):
            parts.append(f"a.user_id::text = '{entities['user_id']}'")
        if entities.get("driver_id"):
            parts.append(f"a.driver_id::text = '{entities['driver_id']}'")
        if entities.get("offset_hours") is not None:
            try:
                oh = int(entities["offset_hours"])
                parts.append(f"a.offset_hours = {oh}")
            except (TypeError, ValueError):
                pass
        if entities.get("month") and entities.get("calendar_month") is None:
            try:
                month = max(1, min(12, int(entities["month"])))
                parts.append(f"EXTRACT(MONTH FROM a.order_timestamp::timestamp) = {month}")
            except (TypeError, ValueError):
                pass
        return " AND ".join(parts)

    def generate(
        self,
        intent: IntentKind,
        entities: dict[str, Any],
        metric_sql: str,
        *,
        use_campaigns_only: bool,
        workspace_id: Optional[str],
        source_table: Optional[str] = None,
    ) -> str:
        _ = use_campaigns_only
        return self._orders_sql(intent, entities, metric_sql, workspace_id, source_table=source_table)

    @staticmethod
    def _build_time_filter(entities: dict[str, Any], weeks: int, *, default_time_column: str = "order_timestamp") -> str:
        time_col_default = default_time_column if default_time_column in ("order_timestamp", "driverdone_timestamp", "clientcancel_timestamp") else "order_timestamp"
        cm = entities.get("calendar_month")
        cy_for_month = entities.get("calendar_year")
        if cm is not None and cy_for_month is not None:
            try:
                month = int(cm)
                year = int(cy_for_month)
            except (TypeError, ValueError):
                month = None
                year = None
            if month is not None and year is not None and 1 <= month <= 12 and 2000 <= year <= 2100:
                next_month = 1 if month == 12 else month + 1
                next_year = year + 1 if month == 12 else year
                col = str(entities.get("time_window_anchor") or time_col_default)
                if col not in ("order_timestamp", "driverdone_timestamp", "clientcancel_timestamp"):
                    col = time_col_default
                return (
                    f"a.{col}::timestamptz >= make_timestamptz({year}, {month}, 1, 0, 0, 0, 'UTC') "
                    f"AND a.{col}::timestamptz < make_timestamptz({next_year}, {next_month}, 1, 0, 0, 0, 'UTC')"
                )
        cy = entities.get("calendar_year")
        if cy is not None:
            try:
                y = int(cy)
            except (TypeError, ValueError):
                y = None
            if y is not None and 2000 <= y <= 2100:
                col = str(entities.get("time_window_anchor") or time_col_default)
                if col not in ("order_timestamp", "driverdone_timestamp", "clientcancel_timestamp"):
                    col = time_col_default
                # Завершение поездки: календарный год в Europe/Moscow (как в эталонах по in-city датасету),
                # иначе границы UTC сдвигают ночные поездки относительно «2026 года» в РФ.
                if col == "driverdone_timestamp":
                    return (
                        f"(a.{col} AT TIME ZONE 'Europe/Moscow')::date >= DATE '{y}-01-01' "
                        f"AND (a.{col} AT TIME ZONE 'Europe/Moscow')::date <= DATE '{y}-12-31'"
                    )
                return (
                    f"a.{col}::timestamptz >= make_timestamptz({y}, 1, 1, 0, 0, 0, 'UTC') "
                    f"AND a.{col}::timestamptz < make_timestamptz({y + 1}, 1, 1, 0, 0, 0, 'UTC')"
                )
        if entities.get("window_days") is not None:
            try:
                d = max(1, min(366, int(entities["window_days"])))
            except (TypeError, ValueError):
                d = 7
            return f"a.{time_col_default}::timestamp >= (current_date - interval '{d} day')"
        time_period = str(entities.get("time_period") or "").lower()
        if time_period == "yesterday":
            return (
                f"a.{time_col_default}::timestamp >= date_trunc('day', current_date) - interval '1 day' "
                f"AND a.{time_col_default}::timestamp < date_trunc('day', current_date)"
            )
        if time_period == "previous_week":
            return (
                f"a.{time_col_default}::timestamp >= date_trunc('week', current_date) - interval '2 week' "
                f"AND a.{time_col_default}::timestamp < date_trunc('week', current_date) - interval '1 week'"
            )
        if time_period in {"this_week", "current_week"}:
            return f"a.{time_col_default}::timestamp >= date_trunc('week', current_date)"
        if time_period == "last_week":
            return (
                f"a.{time_col_default}::timestamp >= date_trunc('week', current_date) - interval '1 week' "
                f"AND a.{time_col_default}::timestamp < date_trunc('week', current_date)"
            )
        if time_period in {"this_month", "current_month"}:
            return f"a.{time_col_default}::timestamp >= date_trunc('month', current_date)"
        if time_period == "last_month":
            return (
                f"a.{time_col_default}::timestamp >= date_trunc('month', current_date) - interval '1 month' "
                f"AND a.{time_col_default}::timestamp < date_trunc('month', current_date)"
            )
        if time_period == "last_full_calendar_month":
            return (
                f"a.{time_col_default}::timestamp >= date_trunc('month', current_date) - interval '1 month' "
                f"AND a.{time_col_default}::timestamp < date_trunc('month', current_date)"
            )
        if time_period in {"this_year", "current_year"}:
            return f"a.{time_col_default}::timestamp >= date_trunc('year', current_date)"
        if time_period == "last_year":
            return (
                f"a.{time_col_default}::timestamp >= date_trunc('year', current_date) - interval '1 year' "
                f"AND a.{time_col_default}::timestamp < date_trunc('year', current_date)"
            )
        return f"a.{time_col_default}::timestamp >= current_timestamp - interval '{weeks} weeks'"

    def _orders_sql(
        self,
        intent: IntentKind,
        entities: dict[str, Any],
        metric_sql: str,
        workspace_id: Optional[str],
        *,
        source_table: Optional[str] = None,
    ) -> str:
        table_name = self._resolve_source_table(source_table)
        where_base = self.build_where_orders(entities, workspace_id)
        if entities.get("funnel_two_stage_conversion"):
            time_filter = self._build_time_filter(entities, weeks=8, default_time_column="order_timestamp")
            where_with_time = f"{where_base} AND {time_filter}"
            return (
                "SELECT "
                "COUNT(DISTINCT a.order_id)::bigint AS created_orders, "
                "COUNT(DISTINCT CASE WHEN a.driveraccept_timestamp IS NOT NULL THEN a.order_id END)::bigint AS accepted_orders, "
                "COUNT(DISTINCT CASE WHEN a.driverdone_timestamp IS NOT NULL THEN a.order_id END)::bigint AS completed_orders, "
                "ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.driveraccept_timestamp IS NOT NULL THEN a.order_id END) "
                "/ NULLIF(COUNT(DISTINCT a.order_id), 0), 2) AS acceptance_conversion, "
                "ROUND(100.0 * COUNT(DISTINCT CASE WHEN a.driverdone_timestamp IS NOT NULL THEN a.order_id END) "
                "/ NULLIF(COUNT(DISTINCT CASE WHEN a.driveraccept_timestamp IS NOT NULL THEN a.order_id END), 0), 2) AS completion_conversion "
                f"FROM {table_name} a WHERE {where_with_time}"
            )
        if entities.get("multi_kpi_last_full_month_by_city"):
            time_filter = self._build_time_filter(entities, weeks=8, default_time_column="order_timestamp")
            where_m = f"{where_base} AND {time_filter}"
            return (
                f"SELECT a.city_id::text AS dim, "
                f"COALESCE(SUM(a.price_order_local), 0)::numeric(18, 2) AS revenue_gmv, "
                f"COUNT(DISTINCT CASE WHEN a.driverdone_timestamp IS NOT NULL THEN a.order_id END)::bigint AS completed_rides, "
                f"ROUND( "
                f"(SUM(a.price_order_local)::numeric / NULLIF(COUNT(DISTINCT CASE WHEN a.driverdone_timestamp IS NOT NULL THEN a.order_id END), 0)), "
                f"2 "
                f") AS avg_check "
                f"FROM {table_name} a WHERE {where_m} "
                f"GROUP BY 1 ORDER BY revenue_gmv DESC NULLS LAST"
            )
        if entities.get("lost_orders_before_driver_accept_top"):
            try:
                y = int(entities.get("calendar_year")) if entities.get("calendar_year") is not None else None
            except (TypeError, ValueError):
                y = None
            if y is None or not (2000 <= y <= 2100):
                y = 2025
            top_n = int(entities.get("top_n") or 3)
            top_n = max(1, min(50, top_n))
            year_clause = f"EXTRACT(YEAR FROM a.order_timestamp::timestamptz AT TIME ZONE 'UTC') = {y}"
            return (
                f"SELECT a.city_id::text AS dim, "
                f"COUNT(DISTINCT CASE WHEN a.cancel_before_accept_local IS NOT NULL THEN a.order_id END)::bigint AS value "
                f"FROM {table_name} a WHERE {where_base} AND {year_clause} "
                f"GROUP BY 1 ORDER BY value DESC NULLS LAST LIMIT {top_n}"
            )
        if entities.get("qr_accepted_at_start_price_within_10m_daily"):
            time_filter = self._build_time_filter(entities, weeks=8, default_time_column="order_timestamp")
            where_qr = f"{where_base} AND {time_filter}"
            qr_cnt = (
                "COUNT(DISTINCT a.order_id) FILTER (WHERE a.driveraccept_timestamp IS NOT NULL "
                "AND a.driveraccept_timestamp <= a.order_timestamp + interval '10 minutes' "
                "AND a.price_order_local IS NOT NULL AND a.price_start_local IS NOT NULL "
                "AND a.price_order_local = a.price_start_local)"
            )
            return (
                f"SELECT date_trunc('day', a.order_timestamp::timestamp)::date AS bucket, "
                f"{qr_cnt}::bigint AS value "
                f"FROM {table_name} a WHERE {where_qr} "
                f"GROUP BY 1 ORDER BY 1"
            )

        if entities.get("driver_efficiency_slice_q1_by_city"):
            drv_table = self._resolve_source_table("public.driver_daily_metrics")
            try:
                cy = int(entities.get("calendar_year")) if entities.get("calendar_year") is not None else None
            except (TypeError, ValueError):
                cy = None
            if cy is None or not (2000 <= cy <= 2100):
                cy = 2025
            return (
                f"SELECT d.city_id::text AS dim, "
                f"SUM(d.rides_count)::bigint AS rides, "
                f"ROUND((SUM(d.online_time_sum_seconds) / 3600.0)::numeric, 2) AS online_hours, "
                f"ROUND( "
                f"(SUM(d.rides_count)::numeric / NULLIF(SUM(d.online_time_sum_seconds)::numeric / 3600.0, 0)), "
                f"4 "
                f") AS rides_per_online_hour "
                f"FROM {drv_table} d "
                f"WHERE d.tender_date_part >= DATE '{cy}-01-01' AND d.tender_date_part < DATE '{cy}-04-01' "
                f"GROUP BY 1 ORDER BY rides DESC NULLS LAST"
            )
        # Два счётчика в одной строке — всегда этот SELECT, даже если LLM выбрал comparison/ranking.
        if entities.get("dual_accept_cancel_counts"):
            dual = (
                "COUNT(*) FILTER (WHERE a.driveraccept_timestamp IS NOT NULL)::bigint AS accepted_rows, "
                "COUNT(*) FILTER (WHERE a.clientcancel_timestamp IS NOT NULL "
                "OR a.drivercancel_timestamp IS NOT NULL)::bigint AS cancelled_rows"
            )
            return f"SELECT {dual} FROM {table_name} a WHERE {where_base}"

        grain = entities.get("time_grain") or "week"
        dims = entities.get("dimensions") if isinstance(entities.get("dimensions"), list) else []
        dim_key = "city_id"
        if "order_channel" in dims:
            dim_key = "order_channel"
        elif "status_order" in dims:
            dim_key = "status_order"
        elif "status_tender" in dims:
            dim_key = "status_tender"
        elif "user_id" in dims:
            dim_key = "user_id"
        elif "driver_id" in dims:
            dim_key = "driver_id"
        elif "offset_hours" in dims:
            dim_key = "offset_hours"
        weeks = int(entities.get("window_weeks") or 8)
        top_n = int(entities.get("top_n") or 5)
        trunc = {"day": "day", "week": "week", "month": "month"}.get(grain, "week")
        metric_hint = str(entities.get("metric_hint") or "").strip()
        default_time_column = "clientcancel_timestamp" if metric_hint == "unique_client_cancels_after_start" else "order_timestamp"
        time_filter = self._build_time_filter(entities, weeks, default_time_column=default_time_column)
        where_with_time = (
            f"{where_base} AND {time_filter}"
        )

        if intent == "summary":
            tp = str(entities.get("time_period") or "").strip().lower()
            has_explicit_time = (
                entities.get("calendar_year") is not None
                or entities.get("window_days") is not None
                or (bool(tp) and tp != "unknown")
            )
            where_summary = (
                f"{where_base} AND {time_filter}" if has_explicit_time else where_base
            )
            return f"SELECT {metric_sql} AS value FROM {table_name} a WHERE {where_summary}"

        if intent in ("trend", "forecast"):
            time_col = "a.order_timestamp::timestamp"
            if str(entities.get("metric_hint") or "").strip() == "unique_client_cancels_after_start":
                time_col = "a.clientcancel_timestamp::timestamp"

            if dim_key in dims:
                return (
                    f"SELECT date_trunc('{trunc}', {time_col}) AS bucket, a.{dim_key}::text AS dim, {metric_sql} AS value "
                    f"FROM {table_name} a WHERE {where_with_time} "
                    f"GROUP BY 1, 2 ORDER BY 1, 2"
                )
            return (
                f"SELECT date_trunc('{trunc}', {time_col}) AS bucket, {metric_sql} AS value "
                f"FROM {table_name} a WHERE {where_with_time} "
                f"GROUP BY 1 ORDER BY 1"
            )

        if intent == "comparison":
            return (
                f"SELECT a.{dim_key}::text AS dim, {metric_sql} AS value FROM {table_name} a WHERE {where_with_time} "
                f"GROUP BY 1 ORDER BY value DESC"
            )

        if intent == "ranking":
            return (
                f"SELECT a.{dim_key}::text AS dim, {metric_sql} AS value FROM {table_name} a WHERE {where_with_time} "
                f"GROUP BY 1 ORDER BY value DESC LIMIT {top_n}"
            )

        if intent == "geo":
            return (
                f"SELECT a.city_id::text AS city_id, {metric_sql} AS value FROM {table_name} a WHERE {where_with_time} "
                f"GROUP BY 1 ORDER BY value DESC LIMIT 50"
            )

        if intent == "share":
            share_dim = (
                dim_key
                if dim_key
                in {"city_id", "status_order", "status_tender", "order_channel", "user_id", "driver_id", "offset_hours"}
                else "status_order"
            )
            return (
                f"WITH base AS ("
                f"SELECT a.{share_dim}::text AS dim, {metric_sql} AS value FROM {table_name} a WHERE {where_with_time} GROUP BY 1"
                f") SELECT dim, value, value / NULLIF(SUM(value) OVER (), 0) AS share FROM base ORDER BY value DESC"
            )

        return (
            f"SELECT date_trunc('{trunc}', a.order_timestamp::timestamp) AS bucket, {metric_sql} AS value "
            f"FROM {table_name} a WHERE {where_with_time} "
            f"GROUP BY 1 ORDER BY 1"
        )
