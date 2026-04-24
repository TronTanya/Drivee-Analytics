from __future__ import annotations

import unittest

from app.services.orchestration.explainability_service import ExplainabilityService
from app.services.orchestration.insight_generation_service import InsightGenerationService


class FallbackServiceTests(unittest.TestCase):
    def test_explainability_fallback_returns_text(self) -> None:
        service = ExplainabilityService(llm_service=None)
        text = service.generate(
            query="Покажи количество отмен по city_id",
            intent="comparison",
            entities={"metric_candidates": ["client_cancellations"], "time_period": "last_week"},
            clarification_required=False,
        )
        self.assertTrue(text)
        self.assertIn("comparison", text)

    def test_insight_fallback_on_empty_rows(self) -> None:
        service = InsightGenerationService(llm_service=None)
        text = service.generate("summary", [], ["value"])
        self.assertIn("0 строк", text)
        self.assertIn("SQL", text)

    def test_insight_fallback_trend_growth(self) -> None:
        service = InsightGenerationService(llm_service=None)
        rows = [
            {"day": "2026-04-01", "revenue": 100.0},
            {"day": "2026-04-02", "revenue": 130.0},
        ]
        text = service.generate("trend", rows, ["day", "revenue"])
        self.assertIn("рост", text.lower())
        self.assertIn("revenue", text)

    def test_insight_fallback_ranking_by_city(self) -> None:
        service = InsightGenerationService(llm_service=None)
        rows = [
            {"city_id": "Алматы", "cancelled_orders": 14},
            {"city_id": "Астана", "cancelled_orders": 6},
        ]
        text = service.generate("ranking", rows, ["city_id", "cancelled_orders"])
        self.assertIn("Алматы", text)
        self.assertIn("cancelled_orders", text)

    def test_insight_single_row_two_metrics_lists_both(self) -> None:
        """Одна строка с двумя числами (принятые / отмены) — не сводим к одному «значению»."""
        service = InsightGenerationService(llm_service=None)
        rows = [{"city_id": "67", "accepted_orders": 476, "cancelled_rows": 166}]
        text = service.generate("summary", rows, ["city_id", "accepted_orders", "cancelled_rows"])
        self.assertIn("476", text)
        self.assertIn("166", text)
        self.assertIn("67", text)
        self.assertRegex(text.lower(), r"принят")
        self.assertRegex(text.lower(), r"отмен")


if __name__ == "__main__":
    unittest.main()
