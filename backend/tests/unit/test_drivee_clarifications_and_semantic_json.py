"""Уточнения NL (Drivee) и проверки semantic_dictionary.json без загрузки SQLAlchemy-моделей."""

from __future__ import annotations

import json
import unittest
from pathlib import Path

from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine


class DriveeClarificationRulesTests(unittest.TestCase):
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


class DriveeSemanticJsonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        path = Path(__file__).resolve().parents[2] / "app" / "data" / "semantic_dictionary.json"
        cls._entries = json.loads(path.read_text(encoding="utf-8"))

    def test_revenue_term_includes_sum_price_order_local(self) -> None:
        rev = next(e for e in self._entries if e.get("id") == "sum_order_price")
        self.assertEqual(rev.get("source_column"), "price_order_local")
        self.assertIn("выручка", rev.get("synonyms") or [])
        self.assertIn("SUM", str(rev.get("sql_expression") or ""))
        self.assertIn("price_order_local", str(rev.get("sql_expression") or ""))

    def test_passenger_daily_has_active_passenger_synonym(self) -> None:
        row = next(e for e in self._entries if e.get("id") == "mpit_pass_orders_daily")
        syns = row.get("synonyms") or []
        self.assertIn("активные пассажиры", syns)
        self.assertEqual(row.get("source_table"), "passenger_daily_metrics")

    def test_driver_daily_has_active_driver_synonym(self) -> None:
        row = next(e for e in self._entries if e.get("id") == "mpit_driver_rides_daily")
        syns = row.get("synonyms") or []
        self.assertIn("активные водители", syns)
        self.assertEqual(row.get("source_table"), "driver_daily_metrics")

    def test_drivee_ds_metric_keys_present(self) -> None:
        keys = {str(e.get("canonical_metric_key") or "") for e in self._entries}
        required = {
            "ride_conversion",
            "acceptance_rate",
            "cancel_after_accept_rate",
            "avg_trip_distance_km",
            "avg_trip_duration_min",
            "driver_online_hours",
            "passenger_online_hours",
            "revenue",
            "completed_rides",
        }
        for key in required:
            self.assertIn(key, keys)

    def test_drivee_daily_sql_expressions_use_generator_alias_a(self) -> None:
        keys = {
            "mpit_pass_orders_count",
            "mpit_driver_rides_count",
            "ride_conversion",
            "acceptance_rate",
            "cancel_after_accept_rate",
            "driver_online_hours",
            "passenger_online_hours",
            "completed_rides",
        }
        for row in self._entries:
            k = str(row.get("canonical_metric_key") or "")
            if k not in keys:
                continue
            expr = str(row.get("sql_expression") or "")
            self.assertNotIn("p.", expr)
            self.assertNotIn("d.", expr)
            self.assertIn("a.", expr)


if __name__ == "__main__":
    unittest.main()
