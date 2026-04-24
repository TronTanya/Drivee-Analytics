from __future__ import annotations

import unittest

from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.sql_generation_service import SQLGenerationService


class IntentSqlTimeFilterTests(unittest.TestCase):
    def test_top_cities_cancellations_is_ranking_not_geo(self) -> None:
        svc = IntentService(llm_service=None)
        res = svc.classify_intent("Покажи топ-10 города по количеству отменённых заказов")
        self.assertEqual(res.intent, "ranking")

    def test_extract_entities_supports_top_dash_number(self) -> None:
        entities = IntentService().extract_entities(
            "Покажи топ-1 города по количеству отменённых заказов на этой месяц."
        )
        self.assertEqual(entities.get("top_n"), 1)
        self.assertEqual(entities.get("metric_hint"), "cancellations_total")

    def test_ranking_sql_uses_this_month_filter(self) -> None:
        sql = SQLGenerationService().generate(
            intent="ranking",
            entities={"top_n": 1, "time_grain": "month", "time_period": "this_month"},
            metric_sql="COUNT(*)",
            use_campaigns_only=False,
            workspace_id=None,
        )
        self.assertIn("date_trunc('month', current_date)", sql)
        self.assertIn("LIMIT 1", sql)

    def test_ranking_sql_uses_order_channel_dimension_when_requested(self) -> None:
        sql = SQLGenerationService().generate(
            intent="ranking",
            entities={
                "top_n": 5,
                "time_period": "current_month",
                "dimensions": ["order_channel"],
            },
            metric_sql="COUNT(*)",
            use_campaigns_only=False,
            workspace_id=None,
        )
        self.assertIn("a.order_channel::text AS dim", sql)
        self.assertIn("LIMIT 5", sql)

    def test_dual_accept_cancel_entities_not_only_cancellations_metric(self) -> None:
        entities = IntentService(llm_service=None).extract_entities(
            "сколько принятых и отмененных заказов в городе 67"
        )
        self.assertTrue(entities.get("dual_accept_cancel_counts"))
        self.assertEqual(entities.get("city_id"), "67")
        self.assertNotIn("metric_hint", entities)

    def test_summary_sql_dual_accept_cancel_columns(self) -> None:
        sql = SQLGenerationService().generate(
            intent="summary",
            entities={"dual_accept_cancel_counts": True, "city_id": "67"},
            metric_sql="COUNT(*)",
            use_campaigns_only=False,
            workspace_id=None,
        )
        self.assertIn("accepted_rows", sql)
        self.assertIn("cancelled_rows", sql)
        self.assertIn("driveraccept_timestamp", sql)
        self.assertIn("clientcancel_timestamp", sql)
        self.assertIn("city_id::text = '67'", sql)
        self.assertNotIn(" AS value ", sql)

    def test_summary_sql_applies_explicit_time_period(self) -> None:
        sql = SQLGenerationService().generate(
            intent="summary",
            entities={"time_period": "current_month", "metric_hint": "orders_count"},
            metric_sql="COUNT(*)",
            use_campaigns_only=False,
            workspace_id=None,
        )
        self.assertIn("date_trunc('month', current_date)", sql)
        self.assertIn("AS value", sql)

    def test_summary_sql_applies_calendar_year_on_driverdone_for_completion_queries(self) -> None:
        sql = SQLGenerationService().generate(
            intent="summary",
            entities={
                "calendar_year": 2026,
                "time_window_anchor": "driverdone_timestamp",
                "metric_hint": "done_rides",
            },
            metric_sql="COUNT(DISTINCT CASE WHEN a.driverdone_timestamp IS NOT NULL THEN a.order_id END)",
            use_campaigns_only=False,
            workspace_id=None,
        )
        self.assertIn("Europe/Moscow", sql)
        self.assertIn("driverdone_timestamp", sql)
        self.assertIn("DATE '2026-01-01'", sql)
        self.assertIn("DATE '2026-12-31'", sql)

    def test_summary_sql_without_time_stays_open_ended(self) -> None:
        sql = SQLGenerationService().generate(
            intent="summary",
            entities={"metric_hint": "orders_count"},
            metric_sql="COUNT(*)",
            use_campaigns_only=False,
            workspace_id=None,
        )
        self.assertIn("WHERE 1=1", sql)
        self.assertNotIn("current_timestamp - interval", sql)

    def test_dual_sql_used_even_when_intent_is_comparison(self) -> None:
        """Регрессия: LLM comparison + одна метрика давали dim/value вместо accepted_rows/cancelled_rows."""
        sql = SQLGenerationService().generate(
            intent="comparison",
            entities={"dual_accept_cancel_counts": True, "city_id": "67"},
            metric_sql="COUNT(*) FILTER (WHERE a.clientcancel_timestamp IS NOT NULL)",
            use_campaigns_only=False,
            workspace_id=None,
        )
        self.assertIn("accepted_rows", sql)
        self.assertIn("cancelled_rows", sql)
        self.assertNotIn("GROUP BY", sql)


if __name__ == "__main__":
    unittest.main()
