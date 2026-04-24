"""Template-based SQL generation per intent (rules first)."""

from __future__ import annotations

import re
from typing import Any, Optional

from app.core.config import settings
from app.schemas.orchestration import IntentKind


class SQLGenerationService:
    SOURCE_TABLE = "train"

    @staticmethod
    def _resolve_source_table(source_table: Optional[str]) -> str:
        """Таблицы из whitelist по basename или staging `schema.t_*` из настроек."""
        allowed = {t.lower() for t in settings.sql_whitelist_tables}
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
            schema = (settings.sql_implicit_schema or "public").strip().lower()
            base = parts[0]
        staging_schema = (settings.csv_staging_schema or "user_staging").strip().lower()
        pat = getattr(settings, "sql_staging_upload_table_pattern", r"^t_[a-f0-9]{12}$") or r"^t_[a-f0-9]{12}$"
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
        if entities.get("month"):
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
    def _build_time_filter(entities: dict[str, Any], weeks: int) -> str:
        if entities.get("window_days") is not None:
            try:
                d = max(1, min(366, int(entities["window_days"])))
            except (TypeError, ValueError):
                d = 7
            return f"a.order_timestamp::timestamp >= (current_date - interval '{d} day')"
        time_period = str(entities.get("time_period") or "").lower()
        if time_period == "yesterday":
            return (
                "a.order_timestamp::timestamp >= date_trunc('day', current_date) - interval '1 day' "
                "AND a.order_timestamp::timestamp < date_trunc('day', current_date)"
            )
        if time_period == "previous_week":
            return (
                "a.order_timestamp::timestamp >= date_trunc('week', current_date) - interval '2 week' "
                "AND a.order_timestamp::timestamp < date_trunc('week', current_date) - interval '1 week'"
            )
        if time_period in {"this_week", "current_week"}:
            return "a.order_timestamp::timestamp >= date_trunc('week', current_date)"
        if time_period == "last_week":
            return (
                "a.order_timestamp::timestamp >= date_trunc('week', current_date) - interval '1 week' "
                "AND a.order_timestamp::timestamp < date_trunc('week', current_date)"
            )
        if time_period in {"this_month", "current_month"}:
            return "a.order_timestamp::timestamp >= date_trunc('month', current_date)"
        if time_period == "last_month":
            return (
                "a.order_timestamp::timestamp >= date_trunc('month', current_date) - interval '1 month' "
                "AND a.order_timestamp::timestamp < date_trunc('month', current_date)"
            )
        if time_period in {"this_year", "current_year"}:
            return "a.order_timestamp::timestamp >= date_trunc('year', current_date)"
        if time_period == "last_year":
            return (
                "a.order_timestamp::timestamp >= date_trunc('year', current_date) - interval '1 year' "
                "AND a.order_timestamp::timestamp < date_trunc('year', current_date)"
            )
        return f"a.order_timestamp::timestamp >= current_timestamp - interval '{weeks} weeks'"

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
        time_filter = self._build_time_filter(entities, weeks)
        where_with_time = (
            f"{where_base} AND {time_filter}"
        )

        if intent == "summary":
            return f"SELECT {metric_sql} AS value FROM {table_name} a WHERE {where_base}"

        if intent in ("trend", "forecast"):
            return (
                f"SELECT date_trunc('{trunc}', a.order_timestamp::timestamp) AS bucket, {metric_sql} AS value "
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
