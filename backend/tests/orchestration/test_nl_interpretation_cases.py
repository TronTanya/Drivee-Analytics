from __future__ import annotations

import unittest

from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.semantic_parser import SemanticParser
from app.services.orchestration.semantic_service import SemanticService


class NLInterpretationCasesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.intent = IntentService(llm_service=None)
        self.parser = SemanticParser()
        self.semantic = SemanticService()
        self.clarification = ClarificationEngine(llm_service=None)

    def _interpret(self, query: str):
        intent_res = self.intent.classify_intent(query)
        entities = self.intent.extract_entities(query)
        interp, _patch = self.parser.build(
            effective_query=query,
            intent=intent_res.intent,
            intent_signals=intent_res.signals,
            entities=entities,
        )
        return intent_res, entities, interp

    def test_revenue_by_cities_previous_week(self) -> None:
        _intent, entities, interp = self._interpret("Покажи выручку по городам за прошлую неделю")
        self.assertIn(interp.intent, ("ranking", "trend", "summary"))
        self.assertIn("sum_order_price", interp.metrics)
        self.assertIn("city_id", interp.dimensions)
        self.assertEqual(interp.time_range.preset, "previous_week")
        self.assertEqual(interp.aggregation, "sum")
        self.assertEqual(interp.chart_hint, "line")
        self.assertGreaterEqual(interp.confidence_score, 0.5)
        self.assertIn("metric_hint", entities)

    def test_compare_orders_by_channels_march(self) -> None:
        _intent, entities, interp = self._interpret("Сравни количество заказов по каналам за март")
        self.assertEqual(interp.intent, "comparison")
        self.assertIn("orders_count", interp.metrics)
        self.assertIn("order_channel", interp.dimensions)
        self.assertEqual(interp.aggregation, "count")
        self.assertEqual(interp.chart_hint, "bar")
        self.assertEqual(entities.get("month"), 3)
        self.assertEqual(interp.time_range.preset, "current_year")

    def test_cancellations_trend_by_day(self) -> None:
        _intent, _entities, interp = self._interpret("Покажи динамику отмен по дням")
        self.assertEqual(interp.intent, "trend")
        self.assertIn("cancellations_total", interp.metrics)
        self.assertIn("day", interp.grouping)
        self.assertEqual(interp.chart_hint, "line")
        self.assertEqual(interp.aggregation, "trend")

    def test_top_5_cities_best(self) -> None:
        _intent, entities, interp = self._interpret("Какие 5 городов лучшие")
        self.assertEqual(interp.intent, "ranking")
        self.assertEqual(entities.get("top_n"), 5)
        self.assertEqual(interp.limit, 5)
        self.assertEqual(interp.sort.direction, "desc")
        self.assertTrue("best_metric_unspecified" in interp.ambiguity_flags or "ranking_metric_missing" in interp.ambiguity_flags)

    def test_best_channels_requests_clarification(self) -> None:
        intent_res, entities, interp = self._interpret("Лучшие каналы за месяц")
        clar = self.clarification.evaluate(
            ClarificationContext(
                effective_query="Лучшие каналы за месяц",
                intent=intent_res.intent,
                entities=entities,
                resolutions=self.semantic.resolve_with_hint("Лучшие каналы за месяц", interp.metric),
                nondefault_semantic_count=1,
                intent_signals=intent_res.signals,
                interpretation=interp,
            )
        )
        self.assertTrue(clar.clarification_required)
        self.assertEqual(clar.clarification_reason, "best_metric_unspecified")
        self.assertGreaterEqual(len(clar.clarification_options), 2)


if __name__ == "__main__":
    unittest.main()
