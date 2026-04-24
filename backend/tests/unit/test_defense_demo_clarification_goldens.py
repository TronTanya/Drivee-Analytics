from __future__ import annotations

import unittest

from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.semantic_parser import SemanticParser
from app.services.orchestration.semantic_service import SemanticService
from tests.fixtures.golden_defense_clarification_cases import GOLDEN_DEFENSE_CLARIFICATION_CASES


class DefenseDemoClarificationGoldensTests(unittest.TestCase):
    """Регрессия clarification-поведения для demo defense NL."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.intent = IntentService(llm_service=None)
        cls.parser = SemanticParser()
        cls.semantic = SemanticService()
        cls.clarification = ClarificationEngine(llm_service=None)

    def _clarify(self, phrase: str):
        intent_result = self.intent.classify_intent(phrase)
        entities = self.intent.extract_entities(phrase)
        interp, _patch = self.parser.build(
            effective_query=phrase,
            intent=intent_result.intent,
            intent_signals=intent_result.signals,
            entities=entities,
        )
        resolutions = self.semantic.resolve_with_hint(phrase, interp.metric)
        nondefault_count = len([r for r in resolutions if r.surface_form != "default"])
        clar = self.clarification.evaluate(
            ClarificationContext(
                effective_query=phrase,
                intent=intent_result.intent,
                entities=entities,
                resolutions=resolutions,
                nondefault_semantic_count=nondefault_count,
                intent_signals=intent_result.signals,
                interpretation=interp,
            )
        )
        return clar

    def test_golden_clarification_cases_are_stable(self) -> None:
        for case in GOLDEN_DEFENSE_CLARIFICATION_CASES:
            phrase = case["phrase"]
            with self.subTest(phrase=phrase):
                clar = self._clarify(phrase)
                self.assertEqual(clar.clarification_required, case["clarification_required"])
                self.assertEqual(clar.clarification_reason, case["clarification_reason"])
                self.assertGreaterEqual(len(clar.clarification_options), case["min_options"])

    def test_golden_clarification_set_shape_is_guarded(self) -> None:
        phrases = [case["phrase"] for case in GOLDEN_DEFENSE_CLARIFICATION_CASES]
        self.assertEqual(len(GOLDEN_DEFENSE_CLARIFICATION_CASES), 6, "golden clarification-набор должен содержать 6 фраз")
        self.assertEqual(
            len(phrases),
            len(set(phrases)),
            "фразы в golden clarification-наборе должны быть уникальными",
        )


if __name__ == "__main__":
    unittest.main()
