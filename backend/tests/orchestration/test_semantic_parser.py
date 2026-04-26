from __future__ import annotations

import unittest

from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.semantic_parser import SemanticParser
from app.services.orchestration.semantic_service import SemanticService


class SemanticParserTests(unittest.TestCase):
    def test_yesterday_and_cancellations_metric(self) -> None:
        p = SemanticParser()
        interp, patch = p.build(
            effective_query="топ городов по отменам за вчера",
            intent="ranking",
            intent_signals=["keyword:ranking:топ"],
            entities={"top_n": 5},
        )
        self.assertEqual(interp.time_range.preset, "yesterday")
        self.assertIn("cancellations_total", interp.metrics)
        self.assertEqual(patch.get("time_period"), "yesterday")

    def test_calendar_year_za_2026_zavershennye_uses_driverdone_anchor(self) -> None:
        p = SemanticParser()
        interp, patch = p.build(
            effective_query="Количество уникальных завершенных поездок за 2026 год",
            intent="summary",
            intent_signals=[],
            entities={"metric_hint": "done_rides"},
        )
        self.assertEqual(interp.time_range.preset, "calendar_year")
        self.assertEqual(interp.time_range.calendar_year, 2026)
        self.assertEqual(interp.time_range.time_window_anchor, "driverdone_timestamp")
        self.assertEqual(patch.get("calendar_year"), 2026)
        self.assertEqual(patch.get("time_window_anchor"), "driverdone_timestamp")
        self.assertNotIn("time_period", patch)

    def test_calendar_year_client_cancel_after_start_uses_clientcancel_anchor(self) -> None:
        p = SemanticParser()
        q = (
            "Какое количество уникальных отмененных поездок со стороны пассажира после начало поездки "
            "было в разрезе месяца и города в 2026 году"
        )
        interp, patch = p.build(
            effective_query=q,
            intent="trend",
            intent_signals=[],
            entities={
                "metric_hint": "unique_client_cancels_after_start",
                "time_grain": "month",
                "dimensions": ["city_id"],
            },
        )
        self.assertEqual(interp.time_range.preset, "calendar_year")
        self.assertEqual(interp.time_range.calendar_year, 2026)
        self.assertEqual(interp.time_range.time_window_anchor, "clientcancel_timestamp")
        self.assertEqual(interp.metrics[0], "unique_client_cancels_after_start")
        self.assertEqual(patch.get("time_window_anchor"), "clientcancel_timestamp")

    def test_explicit_calendar_year_overrides_llm_time_period(self) -> None:
        """LLM может вернуть time_period=current_year; явный «за 2026 год» в тексте важнее для SQL."""
        p = SemanticParser()
        interp, patch = p.build(
            effective_query="Количество уникальных завершенных поездок за 2026 год",
            intent="summary",
            intent_signals=[],
            entities={"metric_hint": "done_rides", "time_period": "current_year"},
        )
        self.assertEqual(interp.time_range.preset, "calendar_year")
        self.assertEqual(interp.time_range.calendar_year, 2026)
        self.assertEqual(patch.get("calendar_year"), 2026)

    def test_explicit_calendar_year_overrides_window_weeks(self) -> None:
        """extract_entities мог положить window_weeks=8 из «последн…» в другом запросе; явный год в тексте важнее."""
        p = SemanticParser()
        interp, patch = p.build(
            effective_query="сколько завершённых поездок за 2025 год",
            intent="summary",
            intent_signals=[],
            entities={"metric_hint": "done_rides", "window_weeks": 8},
        )
        self.assertEqual(interp.time_range.preset, "calendar_year")
        self.assertEqual(interp.time_range.calendar_year, 2025)

    def test_explicit_month_year_detected_as_calendar_month(self) -> None:
        p = SemanticParser()
        interp, patch = p.build(
            effective_query="конверсия в принятие и завершение поездки по всей сети за июнь 2025 года",
            intent="summary",
            intent_signals=[],
            entities={"funnel_two_stage_conversion": True},
        )
        self.assertEqual(interp.time_range.preset, "calendar_month")
        self.assertEqual(interp.time_range.calendar_month, 6)
        self.assertEqual(interp.time_range.calendar_year, 2025)
        self.assertEqual(patch.get("calendar_month"), 6)
        self.assertEqual(patch.get("calendar_year"), 2025)

    def test_relative_month_last_year_detected_as_calendar_month(self) -> None:
        p = SemanticParser()
        interp, patch = p.build(
            effective_query="Покажи конверсию по всей сети за прошлый июнь",
            intent="summary",
            intent_signals=[],
            entities={"funnel_two_stage_conversion": True},
        )
        self.assertEqual(interp.time_range.preset, "calendar_month")
        self.assertEqual(interp.time_range.calendar_month, 6)
        self.assertIsNotNone(interp.time_range.calendar_year)
        self.assertEqual(patch.get("calendar_month"), 6)
        self.assertIsNotNone(patch.get("calendar_year"))

    def test_llm_this_week_maps_to_current_week(self) -> None:
        p = SemanticParser()
        interp, patch = p.build(
            effective_query="топ городов по отменам на этой неделе",
            intent="ranking",
            intent_signals=[],
            entities={"time_period": "this_week", "top_n": 3},
        )
        self.assertEqual(interp.time_range.preset, "current_week")
        self.assertEqual(patch.get("time_period"), "current_week")

    def test_resolve_with_hint_prioritizes_interpretation_metric(self) -> None:
        sem = SemanticService()
        r = sem.resolve_with_hint("покажи города", "done_rides")
        self.assertEqual(r[0].term_key, "done_rides")
        self.assertEqual(r[0].surface_form, "interpretation")

    def test_forecast_query_detects_cancellations_metric(self) -> None:
        p = SemanticParser()
        interp, patch = p.build(
            effective_query="прогноз отменённых заказов по дням",
            intent="forecast",
            intent_signals=["keyword:forecast"],
            entities={},
        )
        self.assertIn("cancellations_total", interp.metrics)
        self.assertIsInstance(interp.chart_hint, str)

    def test_city_scope_skipped_when_explicit_po_vsem_gorodam(self) -> None:
        p = SemanticParser()
        q = (
            "Сколько составляет качественная метрика (QR): количество заказов принятых по стартовой цене "
            "в течение 10 минут. В разрезе дня за февраль 2025 года по всем городам"
        )
        interp, _patch = p.build(
            effective_query=q,
            intent="comparison",
            intent_signals=[],
            entities={"dimensions": ["city_id"]},
        )
        self.assertNotIn("city_scope_all_vs_one", interp.ambiguities)
        self.assertNotIn("city_id", interp.dimensions)

    def test_city_scope_stripped_after_llm_merge_when_scope_network(self) -> None:
        """llm_ambiguities не должны возвращать city_scope, если уже задан scope=network."""
        p = SemanticParser()
        interp, _patch = p.build(
            effective_query="QR в разрезе дня по всем городам",
            intent="trend",
            intent_signals=[],
            entities={"scope": "network", "llm_ambiguities": ["city_scope_all_vs_one"]},
        )
        self.assertNotIn("city_scope_all_vs_one", interp.ambiguities)

    def test_revenue_ambiguity_triggers_clarification(self) -> None:
        p = SemanticParser()
        sem = SemanticService()
        interp, _patch = p.build(
            effective_query="Выручка по городам за неделю",
            intent="ranking",
            intent_signals=[],
            entities={"top_n": 3},
        )
        self.assertIn("revenue_definition_unclear", interp.ambiguities)
        eng = ClarificationEngine(llm_service=None)
        hint = interp.metrics[0] if interp.metrics else ""
        clar = eng.evaluate(
            ClarificationContext(
                effective_query="Выручка по городам за неделю",
                intent="ranking",
                entities={"top_n": 3},
                resolutions=sem.resolve_with_hint("Выручка по городам за неделю", hint),
                nondefault_semantic_count=1,
                intent_signals=[],
                interpretation=interp,
            )
        )
        self.assertTrue(clar.clarification_required)
        self.assertEqual(clar.clarification_reason, "revenue_definition_ambiguous")


if __name__ == "__main__":
    unittest.main()
