"""Structured SQL validation result (guardrails + role-aware checks)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class SQLValidationResult(BaseModel):
    is_valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    normalized_sql: str = ""
    final_sql: str = ""
    applied_rules: list[str] = Field(default_factory=list)
    accessible_tables: list[str] = Field(default_factory=list)
    role_access_check: bool = True
    # Человекочитаемое объяснение для UI / trace (таблицы, фильтры, метрика, группировка).
    query_explanation: dict[str, Any] = Field(default_factory=dict)
    # Превью до тяжёлого запуска: сложность, риск скана, подсказки.
    preview_assessment: dict[str, Any] = Field(default_factory=dict)
    # Эвристики корректности (колонки, GROUP BY, окно времени); пустой результат — на этапе execute.
    data_correctness: dict[str, Any] = Field(default_factory=dict)
    # Производительность: предупреждения, sample-cap, рекомендации rollup (MVP).
    performance: dict[str, Any] = Field(default_factory=dict)
    # Explainability блока guardrails: почему SQL разрешён или отклонён, какие правила сработали.
    guardrail_explainability: dict[str, Any] = Field(default_factory=dict)
