"""Семантика Drivee (daily CSV) и правила уточнений для размытых NL-формулировок."""

from __future__ import annotations

import unittest

from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.semantic_service import SemanticService
class DriveeSemanticAndClarificationsTests(unittest.TestCase):
    def test_revenue_synonym_maps_to_sum_price_order_local(self) -> None:
        sem = SemanticService()
        hits = sem.resolve("выручка по городам за месяц")
        keys = {h.term_key for h in hits}
        self.assertIn("sum_order_price", keys)
        rev = next(h for h in hits if h.term_key == "sum_order_price")
        self.assertIn("SUM", rev.sql_fragment)
        self.assertIn("price_order_local", rev.sql_fragment)

    def test_active_drivers_synonym_resolves_driver_daily_metric(self) -> None:
        sem = SemanticService()
        hits = sem.resolve("активные водители по дням за неделю")
        keys = {h.term_key for h in hits}
        self.assertIn("mpit_driver_rides_count", keys)

    def test_active_passengers_synonym_resolves_passenger_daily_metric(self) -> None:
        sem = SemanticService()
        hits = sem.resolve("активные пассажиры по городам")
        keys = {h.term_key for h in hits}
        self.assertIn("mpit_pass_orders_count", keys)

    def _ctx(self, query: str) -> ClarificationContext:
        return ClarificationContext(
            effective_query=query,
            intent="ranking",
            entities={},
            resolutions=[],
            nondefault_semantic_count=0,
            intent_signals=[],
            interpretation=None,
        )

    def test_vague_cancellations_triggers_clarification(self) -> None:
        eng = ClarificationEngine(llm_service=None)
        r = eng.evaluate(self._ctx("Покажи отмены"))
        self.assertTrue(r.clarification_required)
        self.assertEqual(r.clarification_reason, "cancellations_scope_vague")

    def test_best_cities_triggers_clarification(self) -> None:
        eng = ClarificationEngine(llm_service=None)
        r = eng.evaluate(self._ctx("Покажи лучшие города"))
        self.assertTrue(r.clarification_required)
        self.assertEqual(r.clarification_reason, "best_cities_vague")


if __name__ == "__main__":
    unittest.main()
