from __future__ import annotations

import unittest

from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.semantic_parser import SemanticParser
from tests.fixtures.golden_defense_nl_cases import GOLDEN_DEFENSE_NL_CASES


class DefenseDemoNlGoldensTests(unittest.TestCase):
    """Регрессия по "золотому" набору demo-фраз для сценария защиты."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.intent = IntentService(llm_service=None)
        cls.parser = SemanticParser()

    def _interpret(self, phrase: str):
        intent_result = self.intent.classify_intent(phrase)
        entities = self.intent.extract_entities(phrase)
        interp, _patch = self.parser.build(
            effective_query=phrase,
            intent=intent_result.intent,
            intent_signals=intent_result.signals,
            entities=entities,
        )
        return interp

    def test_golden_demo_phrases_are_stable(self) -> None:
        for case in GOLDEN_DEFENSE_NL_CASES:
            phrase = case["phrase"]
            with self.subTest(phrase=phrase):
                interp = self._interpret(phrase)

                self.assertEqual(interp.intent, case["intent"])
                self.assertEqual(interp.metric, case["metric"])
                self.assertEqual(interp.grouping, case["grouping"])
                expected_filters = case["filters"]
                for key, value in expected_filters.items():
                    self.assertEqual(interp.filters.get(key), value, msg=f"entity filter {key!r}")
                unexpected = set(interp.filters.keys()) - set(expected_filters.keys())
                self.assertTrue(
                    unexpected.issubset({"time_period", "window_days", "window_weeks"}),
                    msg=f"unexpected filters in parse result: {sorted(unexpected)}",
                )
                self.assertEqual(interp.chart_hint, case["chart_hint"])

                expected_time = case["time_range"]
                self.assertEqual(interp.time_range.preset, expected_time["preset"])
                if "window_days" in expected_time:
                    self.assertEqual(interp.time_range.window_days, expected_time["window_days"])
                if "window_weeks" in expected_time:
                    self.assertEqual(interp.time_range.window_weeks, expected_time["window_weeks"])

                required_flags = set(case.get("ambiguity_required_flags", []))
                self.assertTrue(
                    required_flags.issubset(set(interp.ambiguity_flags)),
                    msg=f"missing ambiguity flags: {sorted(required_flags - set(interp.ambiguity_flags))}",
                )
                if not required_flags:
                    self.assertEqual(interp.ambiguity_flags, [])

    def test_golden_set_shape_is_guarded(self) -> None:
        phrases = [case["phrase"] for case in GOLDEN_DEFENSE_NL_CASES]
        self.assertEqual(len(GOLDEN_DEFENSE_NL_CASES), 10, "golden-набор должен содержать ровно 10 фраз")
        self.assertEqual(len(phrases), len(set(phrases)), "фразы в golden-наборе должны быть уникальными")


if __name__ == "__main__":
    unittest.main()
