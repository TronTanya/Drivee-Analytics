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
        query = "Количество отмен пассажира в мае 2025"
        resolutions = semantic.resolve(query)
        nd = sum(1 for r in resolutions if r.surface_form != "default")
        engine = ClarificationEngine(llm_service=_FakeLLMService())
        response = engine.evaluate(
            ClarificationContext(
                effective_query=query,
                intent="summary",
                entities={"time_grain": "month", "metric_hint": "cancellations_total"},
                resolutions=resolutions,
                nondefault_semantic_count=nd,
                intent_signals=[],
            )
        )
        self.assertFalse(response.clarification_required)

    def test_clarification_ignores_llm_for_explicit_two_stage_conversion(self) -> None:
        semantic = SemanticService()
        query = (
            "Какая конверсия составляет в два основных этапа у пассажиров "
            "(в принятие заказа, в завершении поездки) по всей сети за Июнь 2025 год"
        )
        resolutions = semantic.resolve(query)
        nd = sum(1 for r in resolutions if r.surface_form != "default")
        engine = ClarificationEngine(llm_service=_FakeLLMService())
        response = engine.evaluate(
            ClarificationContext(
                effective_query=query,
                intent="summary",
                entities={"time_grain": "month"},
                resolutions=resolutions,
                nondefault_semantic_count=nd,
                intent_signals=[],
            )
        )
        self.assertFalse(response.clarification_required)

    def test_clarification_ignores_llm_for_two_stage_conversion_variants(self) -> None:
        semantic = SemanticService()
        variants = [
            "Конверсия пассажиров в 2 этапа: принятие заказа и завершение поездки за июнь 2025 по всей сети",
            "Покажи conversion пассажиров по всей сети за June 2025: acceptance и completed rides",
            "Какая конверсия у пассажиров в принятие и в завершение поездки за июнь 2025",
            "Конверсия пассажиров: из заказов с тендерами в принятие, затем в завершенные поездки за июнь 2025",
            "Какая конверсия в два этапа у пассажиров (в принятие, в завершении поездки) за июнь 2025",
        ]
        engine = ClarificationEngine(llm_service=_FakeLLMService())
        for query in variants:
            with self.subTest(query=query):
                resolutions = semantic.resolve(query)
                nd = sum(1 for r in resolutions if r.surface_form != "default")
                response = engine.evaluate(
                    ClarificationContext(
                        effective_query=query,
                        intent="summary",
                        entities={"time_grain": "month"},
                        resolutions=resolutions,
                        nondefault_semantic_count=nd,
                        intent_signals=[],
                    )
                )
                self.assertFalse(response.clarification_required)


if __name__ == "__main__":
    unittest.main()
