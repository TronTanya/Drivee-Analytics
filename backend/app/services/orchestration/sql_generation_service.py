"""Template-based SQL generation per intent (rules first)."""

from __future__ import annotations

from typing import Any, Optional

from app.schemas.orchestration import IntentKind


class SQLGenerationService:
    SOURCE_TABLE = "anonymized_incity_orders"

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
        return " AND ".join(parts)

    def generate(
        self,
        intent: IntentKind,
        entities: dict[str, Any],
        metric_sql: str,
        *,
        use_campaigns_only: bool,
        workspace_id: Optional[str],
    ) -> str:
        _ = use_campaigns_only
        return self._orders_sql(intent, entities, metric_sql, workspace_id)

    @staticmethod
    def _build_time_filter(entities: dict[str, Any], weeks: int) -> str:
        time_period = str(entities.get("time_period") or "").lower()
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
    ) -> str:
        where_base = self.build_where_orders(entities, workspace_id)
        grain = entities.get("time_grain") or "week"
        weeks = int(entities.get("window_weeks") or 8)
        top_n = int(entities.get("top_n") or 5)
        trunc = {"day": "day", "week": "week", "month": "month"}.get(grain, "week")
        time_filter = self._build_time_filter(entities, weeks)
        where_with_time = (
            f"{where_base} AND {time_filter}"
        )

        if intent == "summary":
            return f"SELECT {metric_sql} AS value FROM {self.SOURCE_TABLE} a WHERE {where_base}"

        if intent in ("trend", "forecast"):
            return (
                f"SELECT date_trunc('{trunc}', a.order_timestamp::timestamp) AS bucket, {metric_sql} AS value "
                f"FROM {self.SOURCE_TABLE} a WHERE {where_with_time} "
                f"GROUP BY 1 ORDER BY 1"
            )

        if intent == "comparison":
            return (
                f"SELECT a.city_id::text AS dim, {metric_sql} AS value FROM {self.SOURCE_TABLE} a WHERE {where_with_time} "
                f"GROUP BY 1 ORDER BY value DESC"
            )

        if intent == "ranking":
            return (
                f"SELECT a.city_id::text AS dim, {metric_sql} AS value FROM {self.SOURCE_TABLE} a WHERE {where_with_time} "
                f"GROUP BY 1 ORDER BY value DESC LIMIT {top_n}"
            )

        if intent == "geo":
            return (
                f"SELECT a.city_id::text AS city_id, {metric_sql} AS value FROM {self.SOURCE_TABLE} a WHERE {where_with_time} "
                f"GROUP BY 1 ORDER BY value DESC LIMIT 50"
            )

        if intent == "share":
            return (
                f"WITH base AS ("
                f"SELECT a.status_order::text AS dim, {metric_sql} AS value FROM {self.SOURCE_TABLE} a WHERE {where_with_time} GROUP BY 1"
                f") SELECT dim, value, value / NULLIF(SUM(value) OVER (), 0) AS share FROM base ORDER BY value DESC"
            )

        return (
            f"SELECT date_trunc('{trunc}', a.order_timestamp::timestamp) AS bucket, {metric_sql} AS value "
            f"FROM {self.SOURCE_TABLE} a WHERE {where_with_time} "
            f"GROUP BY 1 ORDER BY 1"
        )
