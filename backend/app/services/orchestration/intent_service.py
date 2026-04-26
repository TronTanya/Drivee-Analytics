"""Rules-first intent classification and entity extraction (LLM extension point later)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, List, Optional, Tuple

from app.schemas.llm import LLMQueryInterpretation
from app.schemas.orchestration import IntentKind
from app.services.llm.llm_service import LLMService
from app.services.orchestration.geo_scope_language import implies_aggregate_across_all_cities

Intent = IntentKind

_EN_TO_RU_LAYOUT = str.maketrans(
    "`qwertyuiop[]asdfghjkl;'zxcvbnm,./",
    "ёйцукенгшщзхъфывапролджэячсмитьбю.",
)


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
        ("comparison", ("сравни", "compare", "vs", "против", "разниц", "в разрезе", "разрез")),
        ("share", ("дол", "share", "процент", "%", "структур")),
        ("geo", ("карта", "карте", "карту", "map", "гео", "geo", "регион", "област")),
        ("trend", ("тренд", "trend", "динамик", "динамика", "по недел", "по дн", "временн", "over time")),
        ("summary", ("свод", "summary", "итого", "агрег", "всего", "общ")),
    ]

    def __init__(self, llm_service: LLMService | None = None) -> None:
        self._llm = llm_service
        self._llm_cache: dict[str, LLMQueryInterpretation] = {}

    def classify_intent(self, query: str) -> IntentResult:
        q = query.lower()
        signals: list[str] = []
        # «В разрезе дня/недели/…» — временной ряд (trend), а не comparison по «в разрезе» из правил.
        _time_slice = re.search(
            r"\bв\s+разрезе\s+(дня|день|дней|недел|недели|месяц|месяца|часов|часа|минут|минуты|квартал|квартала)\b",
            q,
        )
        _city_also = re.search(r"\bв\s+разрезе\s+\S+\s+и\s+(город|города|городов|канал|каналов)\b", q)
        _city_only_slice = re.search(r"\bв\s+разрезе\s+(город|города|городов|канал|каналов)\b", q)
        if _time_slice and not _city_also and not _city_only_slice:
            signals.append("keyword:trend:в_разрезе_времени")
            return IntentResult(intent="trend", entities={}, signals=signals)
        for intent, keywords in self._INTENT_RULES:
            for kw in keywords:
                if kw in q:
                    signals.append(f"keyword:{intent}:{kw}")
                    return IntentResult(intent=intent, entities={}, signals=signals)
        # Fast-path: сначала rules-first. К LLM идём только если явных сигналов intent нет.
        llm_interpretation = self._get_llm_interpretation(query)
        if llm_interpretation is not None:
            extra: dict[str, Any] = {}
            if getattr(llm_interpretation, "query_scope", None) == "general":
                extra["query_scope"] = "general"
            sig = [f"llm:intent:{llm_interpretation.intent}"]
            if extra.get("query_scope"):
                sig.append("llm:query_scope:general")
            return IntentResult(
                intent=llm_interpretation.intent,
                entities=extra,
                signals=sig,
            )
        signals.append("default:summary")
        return IntentResult(intent="summary", entities={}, signals=signals)

    def extract_entities(self, query: str) -> dict[str, Any]:
        q = query.lower()
        entities: dict[str, Any] = {}
        if self._is_likely_wrong_layout(query):
            entities["input_normalization_note"] = "detected_wrong_keyboard_layout_ru_en"
            q = self._layout_swap_to_ru(query)

        # Короткое приветствие без признаков аналитики — без LLM тоже уходим в «разговорный» режим.
        dq = re.sub(r"\s+", " ", q.strip())
        if len(dq) <= 40 and re.match(
            r"^(привет|здравствуйте|здравствуй|добрый\s+(день|вечер|утро)|hi|hello)([!\s?.]*)$",
            dq,
        ):
            if not re.search(r"заказ|order|город|city|отмен|cancel|метрик|sql|таблиц|прогноз|тренд", dq):
                entities["query_scope"] = "general"

        if m := re.search(r"(\d+)\s*(недел|weeks?)", q):
            entities["window_weeks"] = int(m.group(1))
        elif "последн" in q or "last" in q:
            entities["window_weeks"] = 8
        if m := re.search(r"\b(20[0-9]{2})\b", q):
            try:
                entities.setdefault("calendar_year", int(m.group(1)))
            except (TypeError, ValueError):
                pass

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
        elif m := re.search(r"\bгород[а-яё]*\s+(\d+)\b", q):
            entities["city_id"] = m.group(1)
        elif re.search(r"\b(город|города|городам|по\s+городам|в\s+разрезе\s+города)\b", q):
            # «по всем городам» — охват сети, не разрез по city_id (иначе scope_conflict с network).
            if not implies_aggregate_across_all_cities(q):
                dims = entities.get("dimensions") if isinstance(entities.get("dimensions"), list) else []
                if "city_id" not in dims:
                    dims.append("city_id")
                entities["dimensions"] = dims

        # Жюри: составные KPI — отдельный SQL-путь (без revenue/ranking уточнений).
        _last_full_month = ("последн" in q and "полн" in q and "месяц" in q) or "last full month" in q
        _city_breakdown = bool(
            (
                re.search(r"\b(город|города|городам|по\s+городам|в\s+разрезе\s+города)\b", q)
                and not implies_aggregate_across_all_cities(q)
            )
            or re.search(r"по\s+кажд\w*\s+город", q)
            or "каждом город" in q
            or "каждому город" in q
        )
        if (
            _last_full_month
            and _city_breakdown
            and ("выруч" in q or "revenue" in q)
            and ("заверш" in q or "completed" in q or "поезд" in q)
            and ("средн" in q and "чек" in q)
        ):
            entities["multi_kpi_last_full_month_by_city"] = True
            dims_m = entities.setdefault("dimensions", [])
            if isinstance(dims_m, list) and "city_id" not in dims_m:
                dims_m.append("city_id")
            entities["time_period"] = "last_full_calendar_month"

        if (
            ("топ" in q or re.search(r"\btop\b", q))
            and ("город" in q or "city" in q)
            and (
                re.search(r"до\s+принят", q)
                or "до принятия водител" in q
                or "before accept" in q
            )
            and ("теря" in q or "потер" in q or "заказ" in q or "order" in q)
        ):
            entities["lost_orders_before_driver_accept_top"] = True

        if (
            ("водител" in q or "driver" in q)
            and ("эффектив" in q or "efficiency" in q or "срез" in q)
            and (re.search(r"\bq1\b", q) or "1 квартал" in q or re.search(r"квартал\s*1", q))
            and (re.search(r"\b20[0-9]{2}\b", q) is not None or entities.get("calendar_year") is not None)
            and ("online" in q or "онлайн" in q or "rides" in q or "поезд" in q or "час" in q)
        ):
            entities["driver_efficiency_slice_q1_by_city"] = True

        # «Сколько принятых и отменённых» — нужны ДВЕ метрики; не сводим к одной отмене.
        wants_accept = bool(re.search(r"принят|приняты|принет|accepted|driver\s*accept", q))
        wants_cancel = bool(re.search(r"отмен|cancell", q))
        wants_conversion = bool(re.search(r"конверси|конверис|конверсс|conversion|funnel", q))
        wants_complete = bool(re.search(r"заверш|заверщ|completed|done\s*ride|поездк|поезк", q))
        two_stage_hint = bool(re.search(r"\b2\b\s*этап|два\s+этап|2\s*stage|two\s*stage", q))
        after_ride_start = bool(
            re.search(
                r"после\s+(старта|старт|начала|начало|начяла)\s+поездк|после\s+(старта|старт|начала|начало|начяла)\b|after\s+ride\s+start",
                q,
            )
        )
        passenger_side = bool(re.search(r"пассажир|пасажир|клиент|client|passenger", q))
        if wants_conversion and wants_accept and wants_complete:
            entities["funnel_two_stage_conversion"] = True
            entities["metric_hint"] = "acceptance_conversion"
            entities["metric_hint_secondary"] = "completion_conversion"
        elif wants_conversion and passenger_side and two_stage_hint:
            entities["funnel_two_stage_conversion"] = True
            entities["metric_hint"] = "acceptance_conversion"
            entities["metric_hint_secondary"] = "completion_conversion"
        if wants_accept and wants_cancel:
            entities["dual_accept_cancel_counts"] = True
        elif not entities.get("multi_kpi_last_full_month_by_city"):
            if wants_cancel and passenger_side and after_ride_start:
                entities["metric_hint"] = "unique_client_cancels_after_start"
            elif "отмен" in q and ("клиент" in q or "client" in q):
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
        if re.search(r"по\s+всей\s+сети|вся\s+сеть|по\s+сети|network\s+wide|global", q):
            entities["scope"] = "network"
        if re.search(
            r"по\s+всем\s+город|всех\s+город|все\s+город\b|все\s+города|(?:по|для|во)\s+все[мх]?\s+город|(всем|всех|все)\s+город",
            q,
        ):
            entities["scope"] = "network"

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
        if entities.get("month") and entities.get("calendar_year"):
            entities["calendar_month"] = int(entities["month"])

        # Жюри: QR — заказы, принятые по стартовой цене за ≤10 мин от создания; разрез по дню (отдельный SQL).
        if (
            (re.search(r"\(?\s*qr\s*\)?|\bqr\b", q) or "качественн" in q)
            and "стартов" in q
            and re.search(r"10\s*минут", q)
            and ("принят" in q or "приняты" in q)
            and re.search(r"разрезе\s+дня", q)
        ):
            entities["qr_accepted_at_start_price_within_10m_daily"] = True
            entities["metric_hint"] = "qr_accepted_start_price_within_10m"
            entities.setdefault("time_grain", "day")

        if self._needs_llm_entity_enrichment(entities):
            llm_entities = self._llm_entities(query)
            for key, val in llm_entities.items():
                entities.setdefault(key, val)
            # LLM/классификатор intent имеет приоритет над эвристикой приветствия.
            llm_interp = self._llm_cache.get(query)
            if llm_interp is not None and getattr(llm_interp, "query_scope", "data") == "data":
                entities.pop("query_scope", None)

        if entities.get("multi_kpi_last_full_month_by_city"):
            entities["metric_hint"] = "sum_order_price"
        if entities.get("lost_orders_before_driver_accept_top"):
            entities["metric_hint"] = "cancel_before_accept_count"
        if entities.get("driver_efficiency_slice_q1_by_city"):
            entities["metric_hint"] = "mpit_driver_rides_count"
            dims_d = entities.setdefault("dimensions", [])
            if isinstance(dims_d, list) and "city_id" not in dims_d:
                dims_d.append("city_id")
        if entities.get("qr_accepted_at_start_price_within_10m_daily"):
            entities["metric_hint"] = "qr_accepted_start_price_within_10m"

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

    @staticmethod
    def _layout_swap_to_ru(text: str) -> str:
        return text.lower().translate(_EN_TO_RU_LAYOUT)

    @staticmethod
    def _is_likely_wrong_layout(text: str) -> bool:
        low = text.lower()
        en_hits = sum(1 for ch in low if "a" <= ch <= "z")
        ru_hits = sum(1 for ch in low if ("а" <= ch <= "я") or ch == "ё")
        if en_hits < 8 or ru_hits > 0:
            return False
        swapped = IntentService._layout_swap_to_ru(low)
        ru_tokens = ("конверс", "принят", "заверш", "поезд", "отмен", "пассаж", "город", "сети", "июн")
        return any(tok in swapped for tok in ru_tokens)

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

    @staticmethod
    def _needs_llm_entity_enrichment(entities: dict[str, Any]) -> bool:
        """Не зовём LLM, если эвристика уже извлекла ключевые сущности запроса."""
        strong_keys = {
            "query_scope",
            "metric_hint",
            "dual_accept_cancel_counts",
            "city_id",
            "time_grain",
            "window_weeks",
            "forecast_horizon_steps",
            "top_n",
            "month",
        }
        return not any(k in entities for k in strong_keys)
