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


if __name__ == "__main__":
    unittest.main()
