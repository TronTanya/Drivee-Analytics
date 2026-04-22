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
        self.assertEqual(text, "Нет строк результата для краткого вывода.")


if __name__ == "__main__":
    unittest.main()
