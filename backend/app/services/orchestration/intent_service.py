"""Rules-first intent classification and entity extraction (LLM extension point later)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple

from app.schemas.llm import LLMQueryInterpretation
from app.schemas.orchestration import IntentKind
from app.services.llm.llm_service import LLMService

Intent = IntentKind


@dataclass
class IntentResult:
    intent: Intent
    entities: dict[str, Any] = field(default_factory=dict)
    signals: list[str] = field(default_factory=list)


class IntentService:
    """Keyword + pattern rules. Replace `classify` body with LLM adapter when ready."""

    # «топ городов» содержит и «топ», и «город» — сначала ranking/share/trend, иначе «город» уйдёт в geo.
    _INTENT_RULES: list[tuple[Intent, tuple[str, ...]]] = [
        ("forecast", ("прогноз", "forecast", "предсказ", "extrapol")),
        ("ranking", ("топ", "top", "рейтинг", "rank", "лучш", "худш")),
        ("comparison", ("сравни", "compare", "vs", "против", "разниц")),
        ("share", ("дол", "share", "процент", "%", "структур")),
        ("geo", ("карта", "map", "гео", "geo", "регион", "област")),
        ("trend", ("тренд", "trend", "динамик", "динамика", "по недел", "по дн", "временн", "over time")),
        ("summary", ("свод", "summary", "итого", "агрег", "всего", "общ")),
    ]

    def __init__(self, llm_service: LLMService | None = None) -> None:
        self._llm = llm_service
        self._llm_cache: dict[str, LLMQueryInterpretation] = {}

    def classify_intent(self, query: str) -> IntentResult:
        llm_interpretation = self._get_llm_interpretation(query)
        if llm_interpretation is not None:
            return IntentResult(
                intent=llm_interpretation.intent,
                entities={},
                signals=[f"llm:intent:{llm_interpretation.intent}"],
            )
        q = query.lower()
        signals: list[str] = []
        for intent, keywords in self._INTENT_RULES:
            for kw in keywords:
                if kw in q:
                    signals.append(f"keyword:{intent}:{kw}")
                    return IntentResult(intent=intent, entities={}, signals=signals)
        signals.append("default:summary")
        return IntentResult(intent="summary", entities={}, signals=signals)

    def extract_entities(self, query: str) -> dict[str, Any]:
        q = query.lower()
        entities: dict[str, Any] = {}

        if m := re.search(r"(\d+)\s*(недел|weeks?)", q):
            entities["window_weeks"] = int(m.group(1))
        elif "последн" in q or "last" in q:
            entities["window_weeks"] = 8

        if m := re.search(r"на\s*(\d+)\s*(дн|днe|дней|дня|day|days)\b", q):
            entities["forecast_horizon_steps"] = int(m.group(1))
        elif m := re.search(r"на\s*(\d+)\s*(недел|недели|week|weeks)\b", q):
            entities["forecast_horizon_steps"] = int(m.group(1))
        elif m := re.search(r"на\s*(\d+)\s*(месяц|месяца|месяцев|month|months)\b", q):
            entities["forecast_horizon_steps"] = int(m.group(1))

        if "день" in q or "дня" in q or "дням" in q or "по дн" in q or "daily" in q:
            entities["time_grain"] = "day"
        elif "месяц" in q or "month" in q:
            entities["time_grain"] = "month"
        elif "недел" in q or "weekly" in q or "week" in q.split():
            entities["time_grain"] = "week"

        if m := re.search(r"city[_\s-]?id\s*[:=]?\s*(\d+)", q):
            entities["city_id"] = m.group(1)
        elif m := re.search(r"\bгород\s+(\d+)\b", q):
            entities["city_id"] = m.group(1)

        if "отмен" in q and ("клиент" in q or "client" in q):
            entities["metric_hint"] = "client_cancellations"
        elif "отмен" in q and ("водител" in q or "driver" in q):
            entities["metric_hint"] = "driver_cancellations"
        elif "отмен" in q:
            entities["metric_hint"] = "cancellations_total"
        elif "заверш" in q or "done" in q:
            entities["metric_hint"] = "done_rides"
        elif "выруч" in q or "revenue" in q or "оборот" in q or "gmv" in q:
            entities["metric_hint"] = "sum_order_price"

        if m := re.search(r"\bтоп[\s\-]*(\d+)\b", q):
            entities["top_n"] = int(m.group(1))
        elif m := re.search(r"\btop[\s\-]*(\d+)\b", q):
            entities["top_n"] = int(m.group(1))
        elif "топ" in q or "top" in q:
            entities["top_n"] = 5
        elif m := re.search(r"(?:какие|какой|лучшие|best)\s+(\d+)\s+(?:город|канал|cities|channels)", q):
            entities["top_n"] = int(m.group(1))
        elif any(x in q for x in ("лучшие", "best")) and any(x in q for x in ("город", "канал", "cities", "channels")):
            entities["top_n"] = 5

        month_aliases: list[tuple[str, int]] = [
            ("январ", 1),
            ("феврал", 2),
            ("март", 3),
            ("апрел", 4),
            ("мая", 5),
            ("май", 5),
            ("июн", 6),
            ("июл", 7),
            ("август", 8),
            ("сентябр", 9),
            ("октябр", 10),
            ("ноябр", 11),
            ("декабр", 12),
        ]
        for stem, month_num in month_aliases:
            if stem in q:
                entities.setdefault("month", month_num)
                break

        llm_entities = self._llm_entities(query)
        for key, val in llm_entities.items():
            entities.setdefault(key, val)

        return entities

    def detect_follow_up(self, query: str, notebook_context: dict[str, Any]) -> tuple[str, bool]:
        """Returns (effective_query, is_follow_up)."""
        q = query.strip()
        if len(q) < 60 and notebook_context:
            last = notebook_context.get("last_intent") or notebook_context.get("base_metric")
            filters = notebook_context.get("active_filters") or {}
            if last or filters:
                parts = [q]
                if filters.get("city_id"):
                    parts.append(f"city_id:{filters['city_id']}")
                if filters.get("status_order"):
                    parts.append(f"status_order:{filters['status_order']}")
                return " ".join(parts), True
        return q, False

    def preprocess_query(self, raw: str) -> str:
        q = " ".join(raw.strip().split())
        return q

    def detect_ambiguity(
        self, intent: Intent, entities: dict[str, Any], nondefault_semantic_hits: int
    ) -> Tuple[bool, Optional[str], List[str]]:
        """Deprecated: use ClarificationEngine.evaluate. Kept for tests / callers."""
        return False, None, []

    def _get_llm_interpretation(self, query: str) -> LLMQueryInterpretation | None:
        if query in self._llm_cache:
            return self._llm_cache[query]
        if self._llm is None or not self._llm.is_enabled:
            return None
        interpretation = self._llm.interpret_user_query(query=query)
        if interpretation is not None:
            self._llm_cache[query] = interpretation
        return interpretation

    def _llm_entities(self, query: str) -> dict[str, Any]:
        interpretation = self._get_llm_interpretation(query)
        if interpretation is None:
            return {}
        entities: dict[str, Any] = {}
        if interpretation.metrics:
            entities["metric_candidates"] = interpretation.metrics
        if interpretation.dimensions:
            entities["dimension_candidates"] = interpretation.dimensions
        if interpretation.filters:
            entities["filter_candidates"] = interpretation.filters
        if interpretation.time_period:
            entities["time_period"] = interpretation.time_period
        if interpretation.ambiguities:
            entities["llm_ambiguities"] = interpretation.ambiguities
        entities["llm_confidence"] = interpretation.confidence
        if interpretation.comparison:
            entities.setdefault("compare_baseline", str(interpretation.comparison).strip().lower())
        if interpretation.sort:
            entities["sort_hint"] = str(interpretation.sort).strip().lower()
        if interpretation.limit is not None:
            try:
                entities.setdefault("top_n", max(1, min(500, int(interpretation.limit))))
            except (TypeError, ValueError):
                pass
        return entities
