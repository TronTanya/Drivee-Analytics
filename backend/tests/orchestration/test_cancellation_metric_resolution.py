from __future__ import annotations

import unittest

from app.schemas.llm import LLMClarificationResult
from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.semantic_service import SemanticService


class _FakeLLMService:
    is_enabled = True

    def generate_clarification(self, **_: object) -> LLMClarificationResult:
        return LLMClarificationResult(
            clarification_required=True,
            clarification_question="Уточните метрику",
            clarification_options=[],
        )


class CancellationMetricResolutionTests(unittest.TestCase):
    def test_semantic_prefers_cancellations_over_orders_count(self) -> None:
        service = SemanticService()
        resolutions = service.resolve("Покажи топ-1 города по количеству отменённых заказов на этот месяц")
        self.assertGreater(len(resolutions), 0)
        self.assertEqual(resolutions[0].term_key, "cancellations_total")

    def test_clarification_ignores_llm_override_for_explicit_metric(self) -> None:
        semantic = SemanticService()
        resolutions = semantic.resolve("Покажи топ-1 города по количеству отменённых заказов")
        nd = sum(1 for r in resolutions if r.surface_form != "default")
        engine = ClarificationEngine(llm_service=_FakeLLMService())
        response = engine.evaluate(
            ClarificationContext(
                effective_query="Покажи топ-1 города по количеству отменённых заказов",
                intent="ranking",
                entities={"top_n": 1, "time_grain": "month", "metric_hint": "cancellations_total"},
                resolutions=resolutions,
                nondefault_semantic_count=nd,
                intent_signals=["keyword:ranking:топ"],
            )
        )
        self.assertFalse(response.clarification_required)


if __name__ == "__main__":
    unittest.main()
