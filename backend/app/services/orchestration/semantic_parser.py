"""Правила + слияние с LLM: нормализация формулировок → NLQueryInterpretation."""

from __future__ import annotations

import re
from typing import Any, Optional, get_args

from app.schemas.nl_interpretation import (
    ComparisonSpec,
    NLQueryInterpretation,
    SortSpec,
    TimePreset,
    TimeRangeSpec,
)
from app.schemas.orchestration import IntentKind
# RU / EN → канонические ключи метрик (совпадают с canonical_metric_key в semantic_dictionary.json)
_METRIC_PHRASES: list[tuple[str, tuple[str, ...]]] = [
    ("cancellations_total", ("отмен", "отменён", "отменен", "cancel", "cancellation")),
    ("client_cancellations", ("отмен клиент", "клиентск", "client cancel")),
    ("driver_cancellations", ("отмен водител", "driver cancel")),
    ("done_rides", ("выполнен", "заверш", "done ride", "завершённ поезд", "завершенн поезд")),
    ("orders_count", ("заказ", "order", "количество заказ")),
    ("sum_order_price", ("выручк", "revenue", "сумм", "оборот", "gmv")),
    ("avg_order_price", ("средн чек", "средн стоимость", "average price", "avg price")),
    ("done_conversion", ("конверс", "conversion")),
    ("tenders_count", ("тендер", "tender")),
]


_DIMENSION_PHRASES: list[tuple[str, tuple[str, ...]]] = [
    ("city_id", ("по город", "городам", "city", "город")),
    ("status_order", ("статус заказ", "status order", "по статус")),
    ("status_tender", ("статус тендер", "tender")),
]

_TIME_PRESETS: frozenset[str] = frozenset(get_args(TimePreset))

# Синонимы из LLM / фронта → литералы TimePreset (см. nl_interpretation.TimeRangeSpec).
_TIME_PRESET_ALIASES: dict[str, str] = {
    "this_week": "current_week",
    "this_month": "current_month",
    "this_year": "current_year",
    "prev_week": "previous_week",
    "past_week": "last_week",
}


def _canonical_time_preset(raw: str) -> Optional[str]:
    key = raw.strip().lower()
    key = _TIME_PRESET_ALIASES.get(key, key)
    return key if key in _TIME_PRESETS else None


class SemanticParser:
    """Слой нормализации: синонимы, периоды, лимиты; поля LLM уже в `entities` (IntentService)."""

    def build(
        self,
        *,
        effective_query: str,
        intent: IntentKind,
        intent_signals: list[str],
        entities: dict[str, Any],
    ) -> tuple[NLQueryInterpretation, dict[str, Any]]:
        q = effective_query.strip()
        ql = q.lower()
        signals: list[str] = ["rules:base"]

        metrics = self._detect_metrics(ql, entities)
        dimensions = self._detect_dimensions(ql, entities)
        filters: dict[str, Any] = {}
        if entities.get("city_id"):
            filters["city_id"] = entities["city_id"]
        if entities.get("status_order"):
            filters["status_order"] = entities["status_order"]

        time_range = self._detect_time_range(ql, entities)
        comparison = self._detect_comparison(ql, entities)
        sort = self._detect_sort(ql, intent, entities)
        limit = entities.get("top_n")
        if isinstance(limit, int):
            signals.append("rules:top_n")
        else:
            limit = None

        ambiguities: list[str] = []
        if "выручк" in ql or "revenue" in ql:
            hits = [m for m in metrics if m in ("sum_order_price", "done_rides", "avg_order_price")]
            if len(hits) > 1:
                ambiguities.append("revenue_metric_multiple")
            elif ("выручк" in ql or "revenue" in ql) and not any(
                x in ql for x in ("сумм заказ", "заверш", "оплачен", "поезд", "средний чек", "avg order")
            ):
                ambiguities.append("revenue_definition_unclear")

        if ("по город" in ql or "городам" in ql) and intent in ("comparison", "ranking") and not filters.get("city_id"):
            if "city_scope" not in ambiguities:
                ambiguities.append("city_scope_all_vs_one")

        self._merge_entities_llm_fields(entities, metrics, dimensions, time_range, ambiguities, signals)

        if not metrics and entities.get("metric_hint"):
            metrics = [str(entities["metric_hint"])]
            signals.append("rules:metric_hint_fallback")

        llm_conf = entities.get("llm_confidence")
        confidence, band = self._score_confidence(
            intent=intent,
            metrics=metrics,
            dimensions=dimensions,
            time_range=time_range,
            ambiguities=ambiguities,
            intent_signals=intent_signals,
            llm_confidence=float(llm_conf) if llm_conf is not None else None,
        )

        merged_entities = dict(entities)
        interp = NLQueryInterpretation(
            intent=intent,
            entities=merged_entities,
            metrics=metrics,
            dimensions=dimensions,
            filters=filters,
            time_range=time_range,
            comparison=comparison,
            sort=sort,
            limit=limit if isinstance(limit, int) else None,
            ambiguities=ambiguities,
            confidence_score=confidence,
            confidence_band=band,
            source_signals=signals,
        )
        patch = interp.entity_patch()
        return interp, patch

    @staticmethod
    def _detect_metrics(ql: str, entities: dict[str, Any]) -> list[str]:
        found: list[str] = []
        for key, phrases in _METRIC_PHRASES:
            if any(p in ql for p in phrases):
                if key not in found:
                    found.append(key)
        hint = entities.get("metric_hint")
        if isinstance(hint, str) and hint and hint not in found:
            found.insert(0, hint)
        return found[:5]

    @staticmethod
    def _detect_dimensions(ql: str, entities: dict[str, Any]) -> list[str]:
        out: list[str] = []
        for key, phrases in _DIMENSION_PHRASES:
            if any(p in ql for p in phrases):
                if key not in out:
                    out.append(key)
        return out[:5]

    @staticmethod
    def _detect_time_range(ql: str, entities: dict[str, Any]) -> TimeRangeSpec:
        if entities.get("time_period"):
            raw = str(entities["time_period"])
            canon = _canonical_time_preset(raw)
            if canon:
                return TimeRangeSpec(
                    preset=canon,  # type: ignore[arg-type]
                    label_ru=f"time_period={raw.strip().lower()}→{canon}",
                )
            # Неизвестное значение LLM — не падаем на Pydantic; ниже эвристики по тексту запроса.
        if "вчера" in ql or "yesterday" in ql.split():
            return TimeRangeSpec(preset="yesterday", label_ru="вчера")
        if "прошл" in ql and "недел" in ql:
            return TimeRangeSpec(preset="previous_week", label_ru="прошлая неделя")
        if "на этой недел" in ql or "текущ" in ql and "недел" in ql or "эту недел" in ql:
            return TimeRangeSpec(preset="current_week", label_ru="текущая неделя")
        if "за недел" in ql and "прошл" not in ql:
            if "эту" in ql or "текущ" in ql:
                return TimeRangeSpec(preset="current_week", label_ru="за неделю (текущая)")
            return TimeRangeSpec(preset="last_week", label_ru="за неделю (последние 7 дней / прошлая — уточните)")
        if m := re.search(r"последн\w*\s+(\d+)\s*д", ql):
            d = int(m.group(1))
            return TimeRangeSpec(
                preset="rolling_window",
                label_ru=f"последние {d} дней",
                window_days=d,
            )
        if m := re.search(r"(\d+)\s*дн", ql):
            d = int(m.group(1))
            if d <= 31:
                return TimeRangeSpec(preset="rolling_window", label_ru=f"{d} дней", window_days=d)
        if "за месяц" in ql or "текущ" in ql and "месяц" in ql:
            return TimeRangeSpec(preset="current_month", label_ru="текущий месяц")
        if "прошл" in ql and "месяц" in ql:
            return TimeRangeSpec(preset="last_month", label_ru="прошлый месяц")
        ww = entities.get("window_weeks")
        if isinstance(ww, int) and ww > 0:
            return TimeRangeSpec(
                preset="rolling_window",
                label_ru=f"окно {ww} нед.",
                window_weeks=ww,
            )
        return TimeRangeSpec(preset="unknown", label_ru="")

    @staticmethod
    def _detect_comparison(ql: str, entities: dict[str, Any]) -> ComparisonSpec:
        if entities.get("compare_baseline"):
            m = str(entities["compare_baseline"]).lower()
            if m in ("wow", "mom", "yoy"):
                return ComparisonSpec(mode=m, label_ru=m)  # type: ignore[arg-type]
        if "год назад" in ql or "yoy" in ql.split():
            return ComparisonSpec(mode="yoy", label_ru="год к году")
        if "мес" in ql and "к прошл" in ql:
            return ComparisonSpec(mode="mom", label_ru="к прошлому месяцу")
        if "недел" in ql and ("wow" in ql or "к прошл" in ql):
            return ComparisonSpec(mode="wow", label_ru="к прошлой неделе")
        if "сравн" in ql or "compare" in ql or "vs" in ql:
            return ComparisonSpec(mode="unspecified", label_ru="сравнение без базы")
        return ComparisonSpec(mode="none", label_ru="")

    @staticmethod
    def _detect_sort(ql: str, intent: IntentKind, entities: dict[str, Any]) -> SortSpec:
        hint = str(entities.get("sort_hint") or "").lower()
        if hint == "asc":
            return SortSpec(field="value", direction="asc")
        if hint == "desc":
            return SortSpec(field="value", direction="desc")
        if intent == "ranking":
            if any(x in ql for x in ("худш", "миним", "меньш", "asc", "ниж")):
                return SortSpec(field="value", direction="asc")
            return SortSpec(field="value", direction="desc")
        return SortSpec(field="", direction="desc")

    @staticmethod
    def _merge_entities_llm_fields(
        entities: dict[str, Any],
        metrics: list[str],
        dimensions: list[str],
        time_range: TimeRangeSpec,
        ambiguities: list[str],
        signals: list[str],
    ) -> None:
        for m in entities.get("metric_candidates") or []:
            ms = str(m).strip()
            if ms and ms not in metrics:
                metrics.append(ms)
                signals.append("llm:metric_candidates")
        for d in entities.get("dimension_candidates") or []:
            ds = str(d).strip()
            if ds and ds not in dimensions:
                dimensions.append(ds)
                signals.append("llm:dimension_candidates")
        tp = entities.get("time_period")
        if isinstance(tp, str) and tp.strip() and time_range.preset == "unknown":
            raw = tp.strip().lower()
            canon = _canonical_time_preset(raw)
            if canon:
                time_range.preset = canon  # type: ignore[assignment]
                time_range.label_ru = time_range.label_ru or f"LLM:{raw}→{canon}"
                signals.append("llm:time_period")
        for a in entities.get("llm_ambiguities") or []:
            t = str(a).strip()
            if t and t not in ambiguities:
                ambiguities.append(t)
                signals.append("llm:ambiguity")

    @staticmethod
    def _score_confidence(
        *,
        intent: IntentKind,
        metrics: list[str],
        dimensions: list[str],
        time_range: TimeRangeSpec,
        ambiguities: list[str],
        intent_signals: list[str],
        llm_confidence: Optional[float],
    ) -> tuple[float, str]:
        base = 0.78
        if not metrics:
            base -= 0.18
        if time_range.preset == "unknown" and intent in ("trend", "forecast", "ranking", "comparison", "share"):
            base -= 0.1
        if ambiguities:
            base -= min(0.12 * len(ambiguities), 0.28)
        if any("default:" in s for s in intent_signals):
            base -= 0.05
        if dimensions:
            base += 0.03
        if llm_confidence is not None:
            try:
                lc = float(llm_confidence)
                if lc > 0:
                    base = 0.55 * base + 0.45 * max(0.0, min(1.0, lc))
            except (TypeError, ValueError):
                pass
        conf = round(max(0.15, min(0.97, base)), 2)
        if conf >= 0.72:
            band = "high"
        elif conf >= 0.48:
            band = "medium"
        else:
            band = "low"
        return conf, band
