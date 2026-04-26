"""Семантика Drivee (daily CSV) и правила уточнений для размытых NL-формулировок."""

from __future__ import annotations

import unittest

from app.schemas.nl_interpretation import NLQueryInterpretation
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

    def test_city_scope_rule_skipped_when_scope_network(self) -> None:
        eng = ClarificationEngine(llm_service=None)
        interp = NLQueryInterpretation(
            intent="trend",
            entities={"scope": "network", "time_grain": "day"},
            metrics=["orders_count"],
            dimensions=["city_id"],
            ambiguities=["city_scope_all_vs_one"],
            ambiguity_flags=["city_scope_all_vs_one"],
        )
        r = eng.evaluate(
            ClarificationContext(
                effective_query="показатель по всем городам за февраль 2025 по дням",
                intent="trend",
                entities={"scope": "network", "time_grain": "day"},
                resolutions=[],
                nondefault_semantic_count=1,
                intent_signals=[],
                interpretation=interp,
            )
        )
        self.assertNotEqual(r.clarification_reason, "city_scope_ambiguous")

    def test_network_and_city_scope_conflict_triggers_clarification(self) -> None:
        eng = ClarificationEngine(llm_service=None)
        r = eng.evaluate(
            ClarificationContext(
                effective_query="Покажи конверсию по всей сети в разрезе города",
                intent="comparison",
                entities={"scope": "network", "dimensions": ["city_id"]},
                resolutions=[],
                nondefault_semantic_count=0,
                intent_signals=[],
                interpretation=None,
            )
        )
        self.assertTrue(r.clarification_required)
        self.assertEqual(r.clarification_reason, "scope_conflict_network_vs_city")

    def test_scope_conflict_skipped_when_po_vsem_gorodam(self) -> None:
        eng = ClarificationEngine(llm_service=None)
        r = eng.evaluate(
            ClarificationContext(
                effective_query="метрика qr в разрезе дня за февраль 2025 по всем городам",
                intent="trend",
                entities={"scope": "network", "dimensions": ["city_id", "day"], "time_grain": "day"},
                resolutions=[],
                nondefault_semantic_count=1,
                intent_signals=[],
                interpretation=None,
            )
        )
        self.assertNotEqual(r.clarification_reason, "scope_conflict_network_vs_city")


if __name__ == "__main__":
    unittest.main()
