"""Analyze notebook prompt history and suggest a personal dashboard layout."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from typing import Any, Optional

from app.models.notebook import NotebookCell
from app.schemas.dashboard import DashboardSuggestionResponse, SuggestedWidget

METRIC_LABELS_RU: dict[str, str] = {
    "orders_count": "Заказы",
    "done_rides": "Завершенные поездки",
    "client_cancellations": "Отмены клиентом",
    "driver_cancellations": "Отмены водителем",
    "avg_order_price": "Средняя стоимость заказа",
    "sum_order_price": "Суммарная стоимость заказов",
}

MIN_HISTORY = 3
MIN_RECURRING = 2
MIN_TOTAL_DIVERSE = 5
MIN_UNIQUE_SCENARIOS = 3
MAX_WIDGETS = 5


@dataclass
class _ScenarioAgg:
    count: int
    title: str
    chart_type: str
    metric_key: Optional[str]
    intent: str
    scenario_key: str


def _orch(cell: NotebookCell) -> dict[str, Any]:
    return (cell.trace_payload_json or {}).get("orchestration") or {}


def _metric_from_cell(cell: NotebookCell, orch: dict[str, Any]) -> Optional[str]:
    interp = cell.interpreted_intent or {}
    if isinstance(interp, dict):
        m = interp.get("metric")
        if m:
            return str(m)
    terms = orch.get("semantic_terms") or []
    if terms and isinstance(terms, list):
        tk = terms[0].get("term_key") if isinstance(terms[0], dict) else None
        if tk:
            return str(tk)
    return None


def _dimension_key(entities: dict[str, Any]) -> tuple[str, str]:
    """Returns (key, Russian label fragment for titles)."""
    if not isinstance(entities, dict):
        return "none", ""
    if entities.get("city_id"):
        return "city_id", "city_id"
    if entities.get("status_order") or entities.get("status_order_in"):
        return "status_order", "status_order"
    if entities.get("status_tender"):
        return "status_tender", "status_tender"
    return "none", ""


def _prompt_metric_hint(prompt: str) -> Optional[str]:
    p = prompt.lower()
    if "отмен" in p:
        return "client_cancellations"
    if "заверш" in p:
        return "done_rides"
    if "стоим" in p or "price" in p:
        return "avg_order_price"
    return None


def _normalize_api_chart(intent: str, raw: Optional[str], dim_key: str) -> str:
    r = (raw or "").lower().strip()
    if intent == "ranking":
        return "horizontal_bar"
    if intent in ("trend", "forecast"):
        return "line" if r not in ("pie", "bar", "table", "map") else r
    if intent == "share":
        return "pie"
    if intent == "geo":
        return "map"
    if intent == "summary":
        return "kpi"
    if r in ("line", "area", "pie", "bar", "column", "horizontal_bar", "table", "map", "kpi", "forecast"):
        if r == "column":
            return "bar"
        return r
    if dim_key != "none" and intent in ("comparison", "ranking"):
        return "horizontal_bar"
    return "bar"


def _metric_ru(metric: Optional[str], prompt: str) -> str:
    if metric and metric in METRIC_LABELS_RU:
        return METRIC_LABELS_RU[metric]
    hint = _prompt_metric_hint(prompt)
    if hint and hint in METRIC_LABELS_RU:
        return METRIC_LABELS_RU[hint]
    if metric:
        return metric.replace("_", " ").title()
    return "Показатель"


def _build_title(intent: str, metric_ru: str, dim_fragment: str, prompt: str) -> str:
    if intent == "trend" or "динамик" in prompt.lower() or "тренд" in prompt.lower():
        return f"Динамика {metric_ru.lower()}" if metric_ru else "Динамика показателя"
    if intent == "ranking":
        if dim_fragment:
            return f"{metric_ru} по {dim_fragment}"
        return f"Рейтинг: {metric_ru}"
    if intent == "share":
        return f"Доли {metric_ru.lower()}"
    if intent == "comparison":
        return f"Сравнение {metric_ru.lower()}"
    if intent == "geo":
        return f"{metric_ru} по географиям"
    if intent == "forecast":
        return f"Прогноз {metric_ru.lower()}"
    if intent == "summary":
        return f"{metric_ru} (итог)"
    if dim_fragment:
        return f"{metric_ru} по {dim_fragment}"
    return f"{metric_ru}"


def _scenario_from_cell(cell: NotebookCell) -> Optional[_ScenarioAgg]:
    orch = _orch(cell)
    intent = orch.get("intent") or (cell.interpreted_intent or {}).get("intent")
    if not intent:
        return None
    intent = str(intent)
    entities = orch.get("entities") or {}
    dim_key, dim_ru = _dimension_key(entities)
    metric = _metric_from_cell(cell, orch) or _prompt_metric_hint(cell.prompt_text or "")
    chart_raw = cell.chart_type or (orch.get("chart") or {}).get("chart_type")
    api_chart = _normalize_api_chart(intent, chart_raw, dim_key)
    metric_ru = _metric_ru(metric, cell.prompt_text or "")
    title = _build_title(intent, metric_ru, dim_ru, cell.prompt_text or "")
    sk = f"{intent}|{metric or 'any'}|{dim_key}"
    return _ScenarioAgg(
        count=1,
        title=title,
        chart_type=api_chart,
        metric_key=metric,
        intent=intent,
        scenario_key=sk,
    )


def _merge_agg(into: _ScenarioAgg, other: _ScenarioAgg) -> None:
    into.count += 1
    if len(other.title) > len(into.title):
        into.title = other.title


def build_suggestion_from_history(cells: list[NotebookCell]) -> DashboardSuggestionResponse:
    buckets: dict[str, _ScenarioAgg] = {}
    for cell in cells:
        sc = _scenario_from_cell(cell)
        if not sc:
            continue
        if sc.scenario_key not in buckets:
            buckets[sc.scenario_key] = sc
        else:
            _merge_agg(buckets[sc.scenario_key], sc)

    if not buckets:
        return DashboardSuggestionResponse(
            suggest_dashboard=False,
            reason="Нет успешных запросов с распознанным сценарием за выбранный период.",
            suggested_widgets=[],
            history_sample_size=len(cells),
            recurring_scenarios=0,
        )

    counts = Counter()
    for key, agg in buckets.items():
        counts[key] = agg.count

    recurring = sum(1 for _, c in counts.items() if c >= MIN_RECURRING)
    n_unique = len(counts)
    n_total = sum(counts.values())

    suggest = False
    if n_total >= MIN_HISTORY and recurring >= 1:
        suggest = True
    elif n_total >= MIN_TOTAL_DIVERSE and n_unique >= MIN_UNIQUE_SCENARIOS:
        suggest = True

    top_keys = [k for k, _ in counts.most_common(MAX_WIDGETS)]
    widgets: list[SuggestedWidget] = []
    for k in top_keys:
        agg = buckets[k]
        widgets.append(
            SuggestedWidget(
                title=agg.title,
                chart_type=agg.chart_type,
                metric_key=agg.metric_key,
                intent=agg.intent,
                scenario_key=k,
            )
        )

    reason = _build_reason(counts, buckets, suggest, n_total)

    return DashboardSuggestionResponse(
        suggest_dashboard=suggest,
        reason=reason,
        suggested_widgets=widgets,
        history_sample_size=len(cells),
        recurring_scenarios=recurring,
    )


def _build_reason(
    counts: Counter,
    buckets: dict[str, _ScenarioAgg],
    suggest: bool,
    n_total: int,
) -> str:
    if not suggest:
        need = max(MIN_HISTORY, MIN_TOTAL_DIVERSE)
        return (
            f"Пока недостаточно повторяющихся сценариев для персонального дашборда "
            f"({n_total} подходящих запусков). Продолжайте задавать вопросы в ноутбуке — "
            f"после {need}+ успешных запросов и повторов темы мы предложим виджеты."
        )

    top = counts.most_common(3)
    parts: list[str] = []
    for key, c in top:
        agg = buckets[key]
        parts.append(f"«{agg.title}» (~{c}×)")
    if len(parts) >= 2:
        return (
            "Вы часто анализируете похожие темы: "
            + ", ".join(parts[:2])
            + ". Соберите их на одном дашборде для быстрого доступа."
        )
    if parts:
        return f"Частый сценарий: {parts[0]}. Можно закрепить его на персональном дашборде."
    return "Достаточно данных для персонального дашборда."
