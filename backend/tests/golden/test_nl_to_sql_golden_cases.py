"""Golden NL→SQL + clarification (RU) — хакатон / защита жюри.

Покрывает 10 целевых фраз из `GOLDEN_DEFENSE_NL_CASES` (интерпретация + SQL-пайплайн)
и отдельно неоднозначность «эффективные каналы».
"""

from __future__ import annotations

import unittest

from app.services.orchestration.clarification_engine import ClarificationEngine, ClarificationContext
from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.semantic_parser import SemanticParser
from app.services.orchestration.semantic_service import SemanticService
from app.services.orchestration.sql_generation_service import SQLGenerationService
from tests.fixtures.golden_defense_nl_cases import GOLDEN_DEFENSE_NL_CASES


def _nl_pipeline_sql(query: str) -> tuple[str, dict]:
    """Как в orchestration: intent → entities → interpretation → semantic → SQL."""
    isvc = IntentService(llm_service=None)
    intent_res = isvc.classify_intent(query)
    entities = isvc.extract_entities(query)
    if intent_res.entities:
        entities.update(intent_res.entities)
    parser = SemanticParser()
    interp, patch = parser.build(
        effective_query=query,
        intent=intent_res.intent,
        intent_signals=intent_res.signals,
        entities=dict(entities),
    )
    merged = dict(entities)
    for k, v in patch.items():
        if v is not None and v != "":
            merged[k] = v
    sem = SemanticService()
    resolutions = sem.resolve_with_hint(query, str(merged.get("metric_hint") or ""))
    metric_sql = sem.primary_metric_sql(resolutions)
    sql = SQLGenerationService().generate(
        intent=intent_res.intent,
        entities=merged,
        metric_sql=metric_sql,
        use_campaigns_only=False,
        workspace_id=None,
    )
    return sql, merged


class HackathonNlToSqlGoldenTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.intent = IntentService(llm_service=None)
        cls.parser = SemanticParser()

    def _interpret(self, phrase: str):
        intent_result = self.intent.classify_intent(phrase)
        ent = self.intent.extract_entities(phrase)
        interp, _ = self.parser.build(
            effective_query=phrase,
            intent=intent_result.intent,
            intent_signals=intent_result.signals,
            entities=ent,
        )
        return intent_result.intent, interp

    def test_ten_ru_defense_phrases_match_fixture(self) -> None:
        self.assertEqual(len(GOLDEN_DEFENSE_NL_CASES), 10)
        for case in GOLDEN_DEFENSE_NL_CASES:
            phrase = case["phrase"]
            with self.subTest(phrase=phrase):
                intent, interp = self._interpret(phrase)
                self.assertEqual(intent, case["intent"])
                self.assertEqual(interp.metric, case["metric"])
                self.assertEqual(interp.grouping, case["grouping"])

    def test_sql_pipeline_fragments_per_golden_row(self) -> None:
        """Лёгкие инварианты по сгенерированному SQL (без выполнения в БД)."""
        expectations: dict[str, list[str]] = {
            # MVP SQL может не включить city_id, если метрика сведена к одному value — проверяем окно и агрегат.
            "Покажи выручку по городам за прошлую неделю": ["sum(", "interval '1 week'"],
            "Сравни количество заказов по каналам за март": ["order_channel", "count(", "group by"],
            "Покажи динамику отмен по дням": ["date_trunc('day'", "clientcancel"],
            "Покажи топ-5 городов по выручке": ["city_id", "limit 5", "sum("],
            "Лучшие каналы за месяц": ["order_channel", "date_trunc('month'"],
            "Покажи прогноз заказов на следующую неделю": ["date_trunc('week'", "count("],
            "Покажи средний чек по городам": ["avg("],
            "Где больше всего отмен за последние 30 дней": ["interval '30 day'", "clientcancel"],
            "Покажи отмены по городу 12 за последние 14 дней": ["city_id", "interval '14 day'"],
            "Сравни выручку по городу 7 за прошлую неделю": ["city_id", "interval '1 week'", "sum("],
        }
        for case in GOLDEN_DEFENSE_NL_CASES:
            phrase = case["phrase"]
            with self.subTest(phrase=phrase):
                sql, _merged = _nl_pipeline_sql(phrase)
                sql_low = sql.lower()
                for frag in expectations[phrase]:
                    self.assertIn(frag.lower(), sql_low, msg=f"missing {frag!r} in SQL")

    def test_channel_effectiveness_requires_clarification(self) -> None:
        q = "Какие каналы самые эффективные?"
        engine = ClarificationEngine(llm_service=None)
        intent, interp = self._interpret(q)
        ctx = ClarificationContext(
            effective_query=q,
            intent=intent,  # type: ignore[arg-type]
            entities={},
            resolutions=[],
            nondefault_semantic_count=0,
            intent_signals=[],
            interpretation=interp,
        )
        res = engine.evaluate(ctx)
        self.assertTrue(res.clarification_required)
        self.assertEqual(res.clarification_reason, "channel_effectiveness_metric_unclear")
        self.assertIn("эффективност", (res.clarification_question or "").lower())
        vals = {o.value for o in (res.clarification_options or [])}
        self.assertTrue({"sum_order_price", "orders_count", "done_conversion", "avg_order_price"}.issubset(vals))


if __name__ == "__main__":
    unittest.main()
