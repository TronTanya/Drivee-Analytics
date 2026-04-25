"""Правила + слияние с LLM: нормализация формулировок → NLQueryInterpretation."""

from __future__ import annotations

import re
from typing import Any, Literal, Optional, get_args

from app.schemas.nl_interpretation import (
    ComparisonSpec,
    NLQueryInterpretation,
    SortSpec,
    TimePreset,
    TimeRangeSpec,
)
from app.schemas.orchestration import IntentKind
from app.services.semantic_layer.store import get_semantic_dictionary_store
# RU / EN → канонические ключи метрик (совпадают с canonical_metric_key в semantic_dictionary.json)
_METRIC_PHRASES: list[tuple[str, tuple[str, ...]]] = [
    ("cancellations_total", ("отмен", "отменён", "отменен", "cancel", "cancellation")),
    ("client_cancellations", ("отмен клиент", "клиентск", "client cancel")),
    ("driver_cancellations", ("отмен водител", "driver cancel")),
    ("cancellation_rate", ("доля отмен", "процент отмен", "cancellation rate", "cancel rate")),
    ("done_rides", ("выполнен", "заверш", "done ride", "завершённ поезд", "завершенн поезд")),
    ("distinct_orders", ("уникальн заказ", "distinct order", "разных заказ")),
    ("orders_count", ("заказ", "order", "количество заказ")),
    ("train_row_count", ("количество запис", "число строк", "row count", "строк датасет", "records count")),
    ("sum_order_price", ("выручк", "revenue", "сумм", "оборот", "gmv")),
    ("avg_order_price", ("средн чек", "средний чек", "средн стоимость", "average price", "avg price")),
    ("ride_conversion", ("конверсия в поезд", "orders to rides", "ride conversion")),
    ("acceptance_rate", ("конверсия в принят", "acceptance rate", "accepted/with tenders")),
    ("cancel_after_accept_rate", ("отмен после принят", "cancel after accept", "cancel rate")),
    ("avg_trip_distance_km", ("среднее расстояние", "avg distance", "distance km")),
    ("avg_trip_duration_min", ("средняя длительность", "avg duration", "duration min", "среднее время поездки")),
    ("driver_online_hours", ("онлайн водител", "время онлайн водителей", "driver online hours")),
    ("passenger_online_hours", ("онлайн пассажир", "время онлайн пассажиров", "passenger online hours")),
    ("completed_rides", ("completed rides", "завершенные поездки", "выполненные поездки")),
    ("done_conversion", ("конверс", "conversion")),
    ("tenders_count", ("тендер", "tender")),
]


_DIMENSION_PHRASES: list[tuple[str, tuple[str, ...]]] = [
    ("city_id", ("по город", "городам", "city", "город")),
    ("order_channel", ("по канал", "каналам", "канал", "channel")),
    ("status_order", ("статус заказ", "status order", "по статус")),
    ("status_tender", ("статус тендер", "tender")),
    ("offset_hours", ("offset_hours", "смещен часов", "часовой пояс города")),
    ("user_id", ("user id", "ид пользовател")),
    ("driver_id", ("driver id", "ид водител")),
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


_MONTH_RU_TO_NUM: dict[str, int] = {
    "январ": 1,
    "феврал": 2,
    "март": 3,
    "апрел": 4,
    "мая": 5,
    "май": 5,
    "июн": 6,
    "июл": 7,
    "август": 8,
    "сентябр": 9,
    "октябр": 10,
    "ноябр": 11,
    "декабр": 12,
}


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
        entities = dict(entities)
        entities.setdefault("__effective_query__", q)

        metrics = self._detect_metrics(ql, entities)
        dimensions = self._detect_dimensions(ql, entities)
        filters: dict[str, Any] = {}
        if entities.get("city_id"):
            filters["city_id"] = entities["city_id"]
        if entities.get("status_order"):
            filters["status_order"] = entities["status_order"]
        for fk, fv in get_semantic_dictionary_store().resolve_filters(q).items():
            filters.setdefault(fk, fv)

        time_range = self._detect_time_range(ql, entities)
        comparison = self._detect_comparison(ql, entities)
        sort = self._detect_sort(ql, intent, entities)
        aggregation = self._detect_aggregation(intent, metrics, ql)
        grouping = self._detect_grouping(dimensions, entities, time_range)
        chart_hint = self._detect_chart_hint(intent, time_range, comparison, dimensions, ql)
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

        if ("по город" in ql or "городам" in ql or "городов" in ql) and intent in (
            "comparison",
            "ranking",
        ) and not filters.get("city_id"):
            if "city_scope" not in ambiguities:
                ambiguities.append("city_scope_all_vs_one")
        if intent == "ranking" and not metrics:
            ambiguities.append("ranking_metric_missing")
        if "лучш" in ql and "канал" in ql and not metrics:
            ambiguities.append("best_metric_unspecified")

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

        entities.pop("__effective_query__", None)
        merged_entities = dict(entities)
        primary_metric = metrics[0] if metrics else str(entities.get("metric_hint") or "").strip()
        interp = NLQueryInterpretation(
            intent=intent,
            metric=primary_metric,
            entities=merged_entities,
            metrics=metrics,
            dimensions=dimensions,
            filters=filters,
            time_range=time_range,
            comparison=comparison,
            aggregation=aggregation,
            grouping=grouping,
            sort=sort,
            limit=limit if isinstance(limit, int) else None,
            chart_hint=chart_hint,
            ambiguities=ambiguities,
            ambiguity_flags=list(ambiguities),
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
        query = str(entities.get("__effective_query__") or "").strip()
        if query:
            for dim in get_semantic_dictionary_store().resolve_dimensions(query):
                if dim not in out:
                    out.append(dim)
        return out[:5]

    @staticmethod
    def _try_explicit_calendar_year(ql: str) -> Optional[TimeRangeSpec]:
        """Явный год в тексте («за 2026 год», «в 2024») — сильнее preset от LLM и window_weeks из «последние…»."""
        y: int | None = None
        if m := re.search(r"\b(20[0-9]{2})\s*год", ql):
            y = int(m.group(1))
        elif m := re.search(r"\bза\s+(20[0-9]{2})\b", ql):
            y = int(m.group(1))
        elif m := re.search(r"\bв\s+(20[0-9]{2})\b", ql):
            y = int(m.group(1))
        if y is None or not (2000 <= y <= 2100):
            return None
        anchor: Literal["order_timestamp", "driverdone_timestamp"] = (
            "driverdone_timestamp"
            if any(p in ql for p in ("заверш", "выполн", "done ride", "completed ride"))
            else "order_timestamp"
        )
        return TimeRangeSpec(
            preset="calendar_year",
            label_ru=f"календарный год {y}",
            calendar_year=y,
            time_window_anchor=anchor,
        )

    @staticmethod
    def _detect_time_range(ql: str, entities: dict[str, Any]) -> TimeRangeSpec:
        cal = SemanticParser._try_explicit_calendar_year(ql)
        if cal is not None:
            return cal
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
        for stem, month_num in _MONTH_RU_TO_NUM.items():
            if stem in ql:
                entities["month"] = month_num
                return TimeRangeSpec(preset="current_year", label_ru=f"месяц={month_num:02d}")
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
        if intent == "comparison" and any(x in ql for x in ("лучш", "топ", "top", "max")):
            return SortSpec(field="value", direction="desc")
        return SortSpec(field="", direction="desc")

    @staticmethod
    def _detect_aggregation(intent: IntentKind, metrics: list[str], ql: str) -> str:
        if any("avg" in m or "average" in ql or "средн" in ql for m in metrics):
            return "avg"
        if intent == "share":
            return "share"
        if intent == "trend":
            return "trend"
        if intent == "ranking":
            return "ranking"
        if any("sum_" in m for m in metrics) or "выручк" in ql:
            return "sum"
        if any(
            "count" in m
            or m
            in (
                "orders_count",
                "train_row_count",
                "distinct_orders",
                "done_rides",
                "cancellations_total",
            )
            for m in metrics
        ):
            return "count"
        if any(m in ("cancellation_rate", "done_conversion") for m in metrics):
            return "ratio"
        return "count" if metrics else ""

    @staticmethod
    def _detect_grouping(dimensions: list[str], entities: dict[str, Any], time_range: TimeRangeSpec) -> list[str]:
        out = list(dimensions)
        tg = str(entities.get("time_grain") or "").strip().lower()
        if tg in ("day", "week", "month") and tg not in out:
            out.append(tg)
        if time_range.preset in ("current_week", "last_week", "previous_week", "rolling_window") and "day" in out:
            return out
        return out

    @staticmethod
    def _detect_chart_hint(
        intent: IntentKind,
        time_range: TimeRangeSpec,
        comparison: ComparisonSpec,
        dimensions: list[str],
        ql: str,
    ) -> str:
        if "order_channel" in dimensions and intent in ("ranking", "comparison"):
            return "bar"
        if any(x in ql for x in ("доля", "структур", "процент")):
            return "pie"
        if any(x in ql for x in ("рейтинг", "топ")):
            return "horizontal_bar"
        if "прогноз" in ql:
            return "line"
        if intent == "trend" or any(x in ql for x in ("по дням", "динамик", "тренд", "изменени")):
            return "line"
        if intent == "share":
            return "pie"
        if comparison.mode in ("wow", "mom", "yoy"):
            return "bar"
        if intent == "ranking":
            return "bar"
        if time_range.preset in ("current_week", "last_week", "previous_week", "rolling_window"):
            return "line"
        return "table"

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
