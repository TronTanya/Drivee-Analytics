"""Структурированная интерпретация NL-запроса (MVP): метрики, измерения, время, сравнение, уверенность."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.orchestration import IntentKind

TimePreset = Literal[
    "unknown",
    "yesterday",
    "current_week",
    "last_week",
    "previous_week",
    "current_month",
    "last_month",
    "current_year",
    "last_year",
    "rolling_window",
]

ComparisonMode = Literal["none", "wow", "mom", "yoy", "unspecified", "custom"]


class TimeRangeSpec(BaseModel):
    """Нормализованный период; в entities для SQL мапится в time_period / window_*."""

    preset: TimePreset = "unknown"
    label_ru: str = ""
    window_weeks: Optional[int] = None
    window_days: Optional[int] = None


class ComparisonSpec(BaseModel):
    mode: ComparisonMode = "none"
    label_ru: str = ""


class SortSpec(BaseModel):
    field: str = ""  # metric alias или dim
    direction: Literal["desc", "asc"] = "desc"


class NLQueryInterpretation(BaseModel):
    """Промежуточный объект после semantic parse (+ опционально LLM)."""

    intent: IntentKind = "summary"
    entities: dict[str, Any] = Field(default_factory=dict, description="Копия/объединение сущностей для SQL.")
    metrics: list[str] = Field(
        default_factory=list,
        description="Канонические ключи метрик (совпадают с canonical_metric_key в semantic_dictionary.json).",
    )
    dimensions: list[str] = Field(default_factory=list, description="Напр. city_id, status_order.")
    filters: dict[str, Any] = Field(default_factory=dict, description="Явные фильтры: city_id, status_order, …")
    time_range: TimeRangeSpec = Field(default_factory=TimeRangeSpec)
    comparison: ComparisonSpec = Field(default_factory=ComparisonSpec)
    sort: SortSpec = Field(default_factory=SortSpec)
    limit: Optional[int] = Field(default=None, description="TOP N для ranking.")
    ambiguities: list[str] = Field(default_factory=list, description="Короткие коды/тексты неоднозначности.")
    confidence_score: float = Field(default=0.75, ge=0.0, le=1.0)
    confidence_band: Literal["high", "medium", "low"] = "medium"
    source_signals: list[str] = Field(default_factory=list, description="Откуда взяты поля: rules, llm, merge.")

    def entity_patch(self) -> dict[str, Any]:
        """Патч в `entities` для SQLGenerationService и semantic layer."""
        patch: dict[str, Any] = {}
        tr = self.time_range
        if tr.preset == "rolling_window":
            if tr.window_days is not None:
                patch["window_days"] = int(tr.window_days)
            if tr.window_weeks is not None:
                patch["window_weeks"] = int(tr.window_weeks)
        elif tr.preset != "unknown":
            patch["time_period"] = tr.preset
        if tr.window_weeks is not None and "window_weeks" not in patch and tr.preset != "rolling_window":
            patch.setdefault("window_weeks", int(tr.window_weeks))
        if self.limit is not None:
            patch["top_n"] = self.limit
        if self.metrics:
            patch.setdefault("metric_hint", self.metrics[0])
        if self.comparison.mode not in ("none", "unspecified"):
            patch.setdefault("compare_baseline", self.comparison.mode)
        for k, v in self.filters.items():
            if v is not None and v != "":
                patch[k] = v
        return patch

    def human_summary_ru(self) -> str:
        parts: list[str] = []
        parts.append(f"Намерение: {self.intent}")
        if self.metrics:
            parts.append("Метрики: " + ", ".join(self.metrics))
        if self.dimensions:
            parts.append("Измерения: " + ", ".join(self.dimensions))
        if self.time_range.label_ru:
            parts.append(f"Период: {self.time_range.label_ru}")
        elif self.time_range.preset != "unknown":
            parts.append(f"Период: {self.time_range.preset}")
        if self.comparison.mode not in ("none", "unspecified"):
            parts.append(f"Сравнение: {self.comparison.mode}")
        if self.limit is not None:
            parts.append(f"Лимит: топ-{self.limit}")
        if self.sort.field:
            parts.append(f"Сортировка: {self.sort.field} {self.sort.direction}")
        if self.ambiguities:
            parts.append("Заметки: " + "; ".join(self.ambiguities[:4]))
        return " · ".join(parts) if parts else "Интерпретация по умолчанию."
