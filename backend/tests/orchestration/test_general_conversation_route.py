"""Маршрут query_scope=general: ответ текстом без SQL."""

from __future__ import annotations

import unittest

from app.schemas.orchestration import OrchestrationInput
from app.services.orchestration.intent_service import IntentResult, IntentService
from app.services.orchestration.query_orchestrator import QueryOrchestrator


class _GeneralOnlyIntent(IntentService):
    """Фиксируем разговорный запрос без вызова LLM."""

    def classify_intent(self, query: str) -> IntentResult:  # noqa: ARG002
        return IntentResult(
            intent="summary",
            entities={"query_scope": "general"},
            signals=["test:general"],
        )


class GeneralConversationRouteTests(unittest.TestCase):
    def test_skips_sql_and_returns_insight(self) -> None:
        orch = QueryOrchestrator(intent_service=_GeneralOnlyIntent(llm_service=None))
        out = orch.run(
            OrchestrationInput(raw_query="привет"),
            persistence_context=None,
        )
        self.assertEqual(out.execution_status, "succeeded")
        self.assertEqual(out.generated_sql, "")
        self.assertEqual(out.validated_sql, "")
        self.assertEqual(out.rows_returned, 0)
        self.assertTrue(out.insight_text.strip())
        self.assertTrue(out.trace_payload.get("general_conversation"))
        self.assertEqual(out.semantic_resolutions, [])


if __name__ == "__main__":
    unittest.main()
