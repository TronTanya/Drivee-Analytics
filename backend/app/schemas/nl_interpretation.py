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
    "calendar_year",
    "calendar_month",
]

ComparisonMode = Literal["none", "wow", "mom", "yoy", "unspecified", "custom"]


class TimeRangeSpec(BaseModel):
    """Нормализованный период; в entities для SQL мапится в time_period / window_* / calendar_year."""

    preset: TimePreset = "unknown"
    label_ru: str = ""
    window_weeks: Optional[int] = None
    window_days: Optional[int] = None
    calendar_year: Optional[int] = Field(
        default=None,
        description="При preset=calendar_year — год окна; для order_timestamp — UTC, для driverdone — дата в Europe/Moscow.",
    )
    time_window_anchor: Optional[
        Literal["order_timestamp", "driverdone_timestamp", "clientcancel_timestamp"]
    ] = Field(
        default=None,
        description="Колонка для границ calendar_year: заказ, завершение или время отмены клиента.",
    )
    calendar_month: Optional[int] = Field(
        default=None,
        description="При preset=calendar_month — номер месяца (1..12) для calendar_year.",
    )


class ComparisonSpec(BaseModel):
    mode: ComparisonMode = "none"
    label_ru: str = ""


class SortSpec(BaseModel):
    field: str = ""  # metric alias или dim
    direction: Literal["desc", "asc"] = "desc"


class NLQueryInterpretation(BaseModel):
    """Промежуточный объект после semantic parse (+ опционально LLM)."""

    intent: IntentKind = "summary"
    metric: str = Field(default="", description="Основная (первая) метрика запроса.")
    entities: dict[str, Any] = Field(default_factory=dict, description="Копия/объединение сущностей для SQL.")
    metrics: list[str] = Field(
        default_factory=list,
        description="Канонические ключи метрик (совпадают с canonical_metric_key в semantic_dictionary.json).",
    )
    dimensions: list[str] = Field(default_factory=list, description="Напр. city_id, status_order.")
    filters: dict[str, Any] = Field(default_factory=dict, description="Явные фильтры: city_id, status_order, …")
    time_range: TimeRangeSpec = Field(default_factory=TimeRangeSpec)
    comparison: ComparisonSpec = Field(default_factory=ComparisonSpec)
    aggregation: str = Field(default="", description="Тип агрегирования: sum/count/avg/share/trend/ranking.")
    grouping: list[str] = Field(default_factory=list, description="Поля группировки (dimensions + time_grain).")
    sort: SortSpec = Field(default_factory=SortSpec)
    limit: Optional[int] = Field(default=None, description="TOP N для ranking.")
    chart_hint: str = Field(default="", description="Рекомендуемый тип визуализации.")
    ambiguities: list[str] = Field(default_factory=list, description="Короткие коды/тексты неоднозначности.")
    ambiguity_flags: list[str] = Field(default_factory=list, description="Явные флаги неоднозначности для UI.")
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
        elif tr.preset == "calendar_year" and tr.calendar_year is not None:
            patch["calendar_year"] = int(tr.calendar_year)
            if tr.time_window_anchor:
                patch["time_window_anchor"] = tr.time_window_anchor
        elif tr.preset == "calendar_month" and tr.calendar_year is not None and tr.calendar_month is not None:
            patch["calendar_year"] = int(tr.calendar_year)
            patch["calendar_month"] = int(tr.calendar_month)
            if tr.time_window_anchor:
                patch["time_window_anchor"] = tr.time_window_anchor
        elif tr.preset != "unknown":
            patch["time_period"] = tr.preset
        if tr.window_weeks is not None and "window_weeks" not in patch and tr.preset != "rolling_window":
            patch.setdefault("window_weeks", int(tr.window_weeks))
        if self.limit is not None:
            patch["top_n"] = self.limit
        if self.metrics:
            patch.setdefault("metric_hint", self.metrics[0])
        if self.dimensions:
            patch["dimensions"] = list(self.dimensions)
        if self.comparison.mode not in ("none", "unspecified"):
            patch.setdefault("compare_baseline", self.comparison.mode)
        for k, v in self.filters.items():
            if v is not None and v != "":
                if (
                    k == "time_period"
                    and tr.preset == "calendar_year"
                    and tr.calendar_year is not None
                ):
                    continue
                patch[k] = v
        return patch

    def human_summary_ru(self) -> str:
        parts: list[str] = []
        parts.append(f"Намерение: {self.intent}")
        if self.metrics:
            parts.append("Метрики: " + ", ".join(self.metrics))
        if self.aggregation:
            parts.append(f"Агрегация: {self.aggregation}")
        if self.dimensions:
            parts.append("Измерения: " + ", ".join(self.dimensions))
        if self.grouping:
            parts.append("Группировка: " + ", ".join(self.grouping))
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
        if self.chart_hint:
            parts.append(f"График: {self.chart_hint}")
        if self.ambiguities:
            parts.append("Заметки: " + "; ".join(self.ambiguities[:4]))
        return " · ".join(parts) if parts else "Интерпретация по умолчанию."
