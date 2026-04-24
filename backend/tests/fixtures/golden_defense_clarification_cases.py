from __future__ import annotations

from typing import Any

# Golden-набор для регрессии clarification-логики в demo defense.
GOLDEN_DEFENSE_CLARIFICATION_CASES: list[dict[str, Any]] = [
    {
        "phrase": "Покажи выручку по городам за прошлую неделю",
        "clarification_required": True,
        "clarification_reason": "revenue_definition_ambiguous",
        "min_options": 3,
    },
    {
        "phrase": "Покажи топ-5 городов по выручке",
        "clarification_required": True,
        "clarification_reason": "revenue_definition_ambiguous",
        "min_options": 3,
    },
    {
        "phrase": "Лучшие каналы за месяц",
        "clarification_required": True,
        "clarification_reason": "best_metric_unspecified",
        "min_options": 3,
    },
    {
        "phrase": "Сравни выручку по городу 7 за прошлую неделю",
        "clarification_required": True,
        "clarification_reason": "revenue_definition_ambiguous",
        "min_options": 3,
    },
    {
        "phrase": "Покажи средний чек по городам",
        "clarification_required": False,
        "clarification_reason": "",
        "min_options": 0,
    },
    {
        "phrase": "Покажи динамику отмен по дням",
        "clarification_required": False,
        "clarification_reason": "",
        "min_options": 0,
    },
]
