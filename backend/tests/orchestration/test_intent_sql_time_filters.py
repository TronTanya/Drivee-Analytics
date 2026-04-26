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

    def test_classify_intent_v_razreze_dnya_is_trend_not_comparison(self) -> None:
        q = (
            "Сколько составляет качественная метрика (QR): количество заказов принятых по стартовой цене "
            "в течение 10 минут. В разрезе дня за февраль 2025 года по всем городам"
        )
        res = IntentService(llm_service=None).classify_intent(q)
        self.assertEqual(res.intent, "trend")

    def test_extract_entities_po_vsem_gorodam_does_not_add_city_id_dimension(self) -> None:
        q = (
            "Сколько составляет качественная метрика (QR): количество заказов принятых по стартовой цене "
            "в течение 10 минут. В разрезе дня за февраль 2025 года по всем городам"
        )
        ent = IntentService(llm_service=None).extract_entities(q)
        dims = ent.get("dimensions")
        if isinstance(dims, list):
            self.assertNotIn("city_id", dims)
        self.assertEqual(ent.get("scope"), "network")

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

    def test_extract_entities_handles_typo_phrase_for_after_start(self) -> None:
        entities = IntentService(llm_service=None).extract_entities(
            "Какое количество уникальных отмененных поездок со стороны пассажира после начало поездки было в разрезе месяца и города в 2026 году"
        )
        self.assertEqual(entities.get("metric_hint"), "unique_client_cancels_after_start")
        self.assertIn("city_id", entities.get("dimensions", []))

    def test_trend_sql_uses_clientcancel_time_for_after_start_metric(self) -> None:
        sql = SQLGenerationService().generate(
            intent="trend",
            entities={
                "metric_hint": "unique_client_cancels_after_start",
                "time_grain": "month",
                "calendar_year": 2026,
                "dimensions": ["city_id"],
            },
            metric_sql=(
                "COUNT(DISTINCT CASE WHEN a.clientcancel_timestamp IS NOT NULL "
                "AND a.driverstarttheride_timestamp IS NOT NULL "
                "AND a.clientcancel_timestamp > a.driverstarttheride_timestamp THEN a.order_id END)"
            ),
            use_campaigns_only=False,
            workspace_id=None,
        )
        self.assertIn("date_trunc('month', a.clientcancel_timestamp::timestamp)", sql)
        self.assertIn("a.city_id::text AS dim", sql)
        self.assertIn("a.clientcancel_timestamp::timestamptz >=", sql)

    def test_extract_entities_two_stage_conversion_month_and_network(self) -> None:
        entities = IntentService(llm_service=None).extract_entities(
            "Какая конверсия в принятие заказа и завершение поездки по всей сети за июнь 2025 года"
        )
        self.assertTrue(entities.get("funnel_two_stage_conversion"))
        self.assertEqual(entities.get("scope"), "network")
        self.assertEqual(entities.get("calendar_month"), 6)
        self.assertEqual(entities.get("calendar_year"), 2025)

    def test_extract_entities_marks_wrong_keyboard_layout(self) -> None:
        entities = IntentService(llm_service=None).extract_entities(
            "rfrfz rjydthbcbz d 2 'nfgf e gfcf;bhjd gj dctq ctnb pf b.,y 2025"
        )
        self.assertEqual(entities.get("input_normalization_note"), "detected_wrong_keyboard_layout_ru_en")

    def test_summary_sql_for_two_stage_funnel_uses_half_open_month_interval(self) -> None:
        sql = SQLGenerationService().generate(
            intent="summary",
            entities={
                "funnel_two_stage_conversion": True,
                "calendar_year": 2025,
                "calendar_month": 6,
            },
            metric_sql="COUNT(*)",
            use_campaigns_only=False,
            workspace_id=None,
        )
        self.assertIn("created_orders", sql)
        self.assertIn("accepted_orders", sql)
        self.assertIn("completed_orders", sql)
        self.assertIn("acceptance_conversion", sql)
        self.assertIn("completion_conversion", sql)
        self.assertIn("make_timestamptz(2025, 6, 1", sql)
        self.assertIn("make_timestamptz(2025, 7, 1", sql)
        self.assertIn("NULLIF", sql)


if __name__ == "__main__":
    unittest.main()
