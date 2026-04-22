"""Explainability sentence generator for trace payload."""

from __future__ import annotations

from typing import Any

from app.services.llm.llm_service import LLMService


class ExplainabilityService:
    def __init__(self, llm_service: LLMService | None = None) -> None:
        self._llm = llm_service

    def generate(
        self,
        *,
        query: str,
        intent: str,
        entities: dict[str, Any],
        clarification_required: bool,
    ) -> str:
        if self._llm is not None and self._llm.is_enabled:
            llm = self._llm.generate_explainability_text(
                query=query,
                intent=intent,
                entities=entities,
                clarification_required=clarification_required,
            )
            if llm is not None and llm.explanation_text.strip():
                return llm.explanation_text.strip()
        return self._fallback(
            intent=intent,
            entities=entities,
            clarification_required=clarification_required,
        )

    @staticmethod
    def _fallback(*, intent: str, entities: dict[str, Any], clarification_required: bool) -> str:
        metric = entities.get("metric_candidates", ["метрика"])[0] if entities.get("metric_candidates") else "метрика"
        period = entities.get("time_period") or entities.get("time_grain") or "выбранный период"
        if clarification_required:
            return (
                f"Запрос распознан как '{intent}', но параметры недостаточно конкретны. "
                "Система запросила уточнение перед генерацией SQL."
            )
        return f"Система определила intent '{intent}' и подготовила запрос по метрике '{metric}' за {period}."
