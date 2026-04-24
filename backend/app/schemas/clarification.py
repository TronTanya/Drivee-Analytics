"""Clarification engine API shape (ambiguous NL → question + options, no guessing)."""

from __future__ import annotations

from pydantic import BaseModel, Field


def clarification_reason_summary_ru(reason_code: str) -> str:
    """Краткое объяснение для UI / ячейки уточнения (код из ClarificationEngine)."""
    c = (reason_code or "").strip()
    if not c:
        return ""
    labels: dict[str, str] = {
        "llm_detected_ambiguity": "Модель отметила несколько допустимых трактовок запроса.",
        "revenue_definition_ambiguous": "Под запрос подходят разные определения выручки.",
        "best_metric_unspecified": "Не выбрана метрика для понятия «лучшие» или для рейтинга.",
        "city_scope_ambiguous": "Неясно: сравнивать по всем городам или сфокусироваться на одном.",
        "low_interpretation_confidence": "Низкая уверенность интерпретации — нужны уточнения.",
        "comparison_baseline_unspecified": "Не задана база или период для сравнения «с прошлым».",
        "ranking_metric_unspecified": "Не указана метрика, по которой ранжировать.",
        "sales_metric_unspecified": "Не определено, что считать продажами.",
        "effectiveness_metric_unspecified": "Не выбран показатель эффективности.",
        "trend_metric_unspecified": "Не выбрана метрика для динамики.",
        "time_grain_unspecified": "Не задан горизонт или шаг агрегации по времени.",
        "summary_metric_unspecified": "Не выбрана метрика для сводки.",
        "comparison_dimension_unspecified": "Не указано измерение или объект сравнения.",
    }
    return labels.get(c, c.replace("_", " "))


class ClarificationOption(BaseModel):
    label: str
    value: str


class ClarificationResponse(BaseModel):
    """Aligned with product JSON for clarification turns."""

    clarification_required: bool = False
    clarification_reason: str = ""
    clarification_question: str = ""
    clarification_options: list[ClarificationOption] = Field(default_factory=list)

    def to_trace_dict(self, confidence_score: float) -> dict:
        return {
            "clarification_required": self.clarification_required,
            "clarification_reason": self.clarification_reason,
            "clarification_reason_summary_ru": clarification_reason_summary_ru(self.clarification_reason),
            "clarification_question": self.clarification_question,
            "clarification_options": [o.model_dump() for o in self.clarification_options],
            "confidence_score": confidence_score,
        }
