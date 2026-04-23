from __future__ import annotations

import unittest

from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.semantic_parser import SemanticParser
from app.services.orchestration.semantic_service import SemanticService


class SemanticParserTests(unittest.TestCase):
    def test_yesterday_and_cancellations_metric(self) -> None:
        p = SemanticParser()
        interp, patch = p.build(
            effective_query="топ городов по отменам за вчера",
            intent="ranking",
            intent_signals=["keyword:ranking:топ"],
            entities={"top_n": 5},
        )
        self.assertEqual(interp.time_range.preset, "yesterday")
        self.assertIn("cancellations_total", interp.metrics)
        self.assertEqual(patch.get("time_period"), "yesterday")

    def test_resolve_with_hint_prioritizes_interpretation_metric(self) -> None:
        sem = SemanticService()
        r = sem.resolve_with_hint("покажи города", "done_rides")
        self.assertEqual(r[0].term_key, "done_rides")
        self.assertEqual(r[0].surface_form, "interpretation")

    def test_revenue_ambiguity_triggers_clarification(self) -> None:
        p = SemanticParser()
        sem = SemanticService()
        interp, _patch = p.build(
            effective_query="Выручка по городам за неделю",
            intent="ranking",
            intent_signals=[],
            entities={"top_n": 3},
        )
        self.assertIn("revenue_definition_unclear", interp.ambiguities)
        eng = ClarificationEngine(llm_service=None)
        hint = interp.metrics[0] if interp.metrics else ""
        clar = eng.evaluate(
            ClarificationContext(
                effective_query="Выручка по городам за неделю",
                intent="ranking",
                entities={"top_n": 3},
                resolutions=sem.resolve_with_hint("Выручка по городам за неделю", hint),
                nondefault_semantic_count=1,
                intent_signals=[],
                interpretation=interp,
            )
        )
        self.assertTrue(clar.clarification_required)
        self.assertEqual(clar.clarification_reason, "revenue_definition_ambiguous")


if __name__ == "__main__":
    unittest.main()
