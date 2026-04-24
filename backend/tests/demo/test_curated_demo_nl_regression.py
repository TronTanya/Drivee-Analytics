"""
Регрессия NL→intent/entities для промптов защиты.

Источник формулировок: `frontend/lib/demo/defense-scenarios.ts` (CURATED_DEMO_PROMPTS).
При изменении промптов на фронте — синхронизируйте ожидания здесь.
"""

from __future__ import annotations

import unittest

from app.services.orchestration.intent_service import IntentService


class CuratedDemoNlRegressionTests(unittest.TestCase):
    """Без LLM: только rule-based слой, как в CI без ключей."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.svc = IntentService(llm_service=None)

    def _assert_case(
        self,
        prompt: str,
        *,
        intent: str,
        entity_subset: dict,
    ) -> None:
        with self.subTest(prompt=prompt[:48]):
            r = self.svc.classify_intent(prompt)
            e = self.svc.extract_entities(prompt)
            self.assertEqual(r.intent, intent)
            for k, expected in entity_subset.items():
                self.assertEqual(e.get(k), expected, msg=f"entity {k!r}")

    def test_curated_demo_prompts_stable(self) -> None:
        cases: list[tuple[str, str, dict]] = [
            (
                "Покажи топ-3 города по количеству отменённых заказов на этой неделе",
                "ranking",
                {"metric_hint": "cancellations_total", "top_n": 3, "time_grain": "week"},
            ),
            (
                "Сравни долю завершённых заказов Алматы и Астана за последние 14 дней",
                "comparison",
                {"metric_hint": "done_rides", "window_weeks": 8},
            ),
            (
                "Сводка для операционного дашборда: отмены по дням за последние 7 дней",
                "trend",
                {"metric_hint": "cancellations_total", "time_grain": "day", "window_weeks": 8},
            ),
            (
                "Покажи конверсию в завершённую поездку по order_channel за 28 дней",
                "summary",
                {"metric_hint": "done_rides"},
            ),
            (
                "Покажи выручку по дням за последние 7 дней",
                "trend",
                {"metric_hint": "sum_order_price", "time_grain": "day", "window_weeks": 8},
            ),
            (
                "Покажи структуру заказов по городам (доля)",
                "share",
                {},
            ),
            (
                "Покажи отмены по городам на карте за последние 30 дней",
                "geo",
                {"metric_hint": "cancellations_total", "window_weeks": 8},
            ),
        ]
        for prompt, intent, subset in cases:
            self._assert_case(prompt, intent=intent, entity_subset=subset)


if __name__ == "__main__":
    unittest.main()
