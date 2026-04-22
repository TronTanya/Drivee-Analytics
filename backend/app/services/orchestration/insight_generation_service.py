"""Insight text generation service (LLM-first with deterministic fallback)."""

from __future__ import annotations

from typing import Any

from app.services.llm.llm_service import LLMService


class InsightGenerationService:
    def __init__(self, llm_service: LLMService | None = None) -> None:
        self._llm = llm_service

    def generate(self, intent: str, rows: list[dict[str, Any]], columns: list[str]) -> str:
        if self._llm is not None and self._llm.is_enabled:
            llm = self._llm.generate_insight_text(intent=intent, columns=columns, rows=rows)
            if llm is not None and llm.insight_text.strip():
                title = llm.insight_title.strip()
                if title:
                    return f"{title}: {llm.insight_text.strip()}"
                return llm.insight_text.strip()
        return self._fallback(intent, rows, columns)

    @staticmethod
    def _fallback(intent: str, rows: list[dict[str, Any]], columns: list[str]) -> str:
        if not rows:
            return "Нет строк результата для краткого вывода."
        if intent == "summary":
            v = rows[0].get("value")
            return f"Итоговое значение метрики: {v}."
        if intent == "ranking":
            top = rows[0]
            return f"Лидер: {top.get('dim', top)} со значением {top.get('value')}."
        if intent == "share" and len(rows[0]) >= 2:
            return "Доли по сегментам рассчитаны; доминирующий сегмент — первый по value."
        if "value" in rows[0] and len(rows) >= 2:
            vals = [r.get("value") for r in rows if isinstance(r.get("value"), (int, float))]
            if vals:
                return f"Диапазон значений от {min(vals)} до {max(vals)} по {len(rows)} точкам."
        return f"Получено {len(rows)} строк, столбцы: {', '.join(columns)}."
