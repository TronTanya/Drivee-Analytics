"""Rules-first clarification: if the query is under-specified, ask instead of defaulting."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, List, Optional

from app.schemas.clarification import ClarificationOption, ClarificationResponse
from app.schemas.nl_interpretation import NLQueryInterpretation
from app.schemas.orchestration import IntentKind, SemanticTermResolution
from app.services.llm.llm_service import LLMService
from app.services.orchestration.geo_scope_language import implies_aggregate_across_all_cities


# --- Reusable option sets (values = semantic term keys or policy tokens) ---

OPTIONS_CHANNEL_METRICS: List[ClarificationOption] = [
    ClarificationOption(label="По количеству заказов", value="orders_count"),
    ClarificationOption(label="По количеству отмен", value="client_cancellations"),
    ClarificationOption(label="По средней стоимости заказа", value="avg_order_price"),
]

OPTIONS_SALES_METRICS: List[ClarificationOption] = [
    ClarificationOption(label="По числу заказов", value="orders_count"),
    ClarificationOption(label="По завершенным поездкам", value="done_rides"),
    ClarificationOption(label="По суммарной стоимости заказов", value="sum_order_price"),
]

OPTIONS_EFFECTIVENESS_METRICS: List[ClarificationOption] = [
    ClarificationOption(label="Конверсия заказа в завершенную поездку", value="done_conversion"),
    ClarificationOption(label="Отмены до принятия заказа", value="cancel_before_accept_count"),
    ClarificationOption(label="Время до принятия заказа", value="time_to_accept_seconds"),
]

# Для формулировок жюри: «эффективные каналы» без явной метрики.
OPTIONS_CHANNEL_EFFECTIVENESS: List[ClarificationOption] = [
    ClarificationOption(label="По выручке (сумма цен заказов)", value="sum_order_price"),
    ClarificationOption(label="По числу заказов", value="orders_count"),
    ClarificationOption(label="По конверсии в завершённую поездку", value="done_conversion"),
    ClarificationOption(label="По среднему чеку", value="avg_order_price"),
]

OPTIONS_TIME_GRAIN: List[ClarificationOption] = [
    ClarificationOption(label="По дням", value="day"),
    ClarificationOption(label="По неделям", value="week"),
    ClarificationOption(label="По месяцам", value="month"),
]

OPTIONS_SUMMARY_METRICS: List[ClarificationOption] = [
    ClarificationOption(label="Заказы (кол-во)", value="orders_count"),
    ClarificationOption(label="Завершенные поездки", value="done_rides"),
    ClarificationOption(label="Отмены клиентом", value="client_cancellations"),
]

OPTIONS_BASELINE_COMPARE: List[ClarificationOption] = [
    ClarificationOption(label="К тому же периоду прошлого года (YoY)", value="yoy"),
    ClarificationOption(label="К прошлому месяцу (MoM)", value="mom"),
    ClarificationOption(label="К прошлой неделе (WoW)", value="wow"),
]

OPTIONS_GENERIC_COMPARE_DIMENSION: List[ClarificationOption] = [
    ClarificationOption(label="По city_id", value="dimension_city_id"),
    ClarificationOption(label="По status_order", value="dimension_status_order"),
    ClarificationOption(label="По status_tender", value="dimension_status_tender"),
]

OPTIONS_REVENUE_DEFINITION: List[ClarificationOption] = [
    ClarificationOption(
        label="Сумма цен заказов (sum_order_price)",
        value="sum_order_price",
    ),
    ClarificationOption(
        label="Число завершённых поездок (done_rides)",
        value="done_rides",
    ),
    ClarificationOption(
        label="Средний чек (avg_order_price)",
        value="avg_order_price",
    ),
]

OPTIONS_CITY_SCOPE: List[ClarificationOption] = [
    ClarificationOption(
        label="По всем городам (группировка / топ)",
        value="all_cities",
    ),
    ClarificationOption(
        label="Один город — уточните city_id или название в следующем сообщении",
        value="single_city_clarify",
    ),
]


@dataclass
class ClarificationContext:
    effective_query: str
    intent: IntentKind
    entities: dict[str, Any]
    resolutions: List[SemanticTermResolution]
    nondefault_semantic_count: int
    intent_signals: List[str]
    interpretation: Optional[NLQueryInterpretation] = None


class ClarificationEngine:
    """
    Ordered rules — first match wins.
    Extend with LLM later; keep `evaluate` as the single entrypoint.
    """

    def __init__(self, llm_service: LLMService | None = None) -> None:
        self._llm = llm_service

    def evaluate(self, ctx: ClarificationContext) -> ClarificationResponse:
        rules_response = self._evaluate_rules(ctx)
        if self._llm is None or not self._llm.is_enabled:
            return rules_response
        if self._has_high_specificity_business_query(ctx.effective_query):
            return rules_response

        llm = self._llm.generate_clarification(
            query=ctx.effective_query,
            intent=ctx.intent,
            entities=ctx.entities,
            semantic_terms=[r.model_dump() for r in ctx.resolutions],
        )
        if llm is None:
            return rules_response

        # Keep deterministic behaviour for explicit metric wording.
        if llm.clarification_required and (
            self._has_explicit_metric(ctx.effective_query)
            or self._has_explicit_two_stage_conversion(ctx.effective_query)
        ):
            return rules_response

        if llm.clarification_required:
            options = [ClarificationOption(label=o.label, value=o.value) for o in llm.clarification_options]
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="llm_detected_ambiguity",
                clarification_question=llm.clarification_question,
                clarification_options=options,
            )
        return rules_response

    def _evaluate_rules(self, ctx: ClarificationContext) -> ClarificationResponse:
        q = ctx.effective_query.lower()
        nd = ctx.nondefault_semantic_count
        interp = ctx.interpretation

        if "лучш" in q and ("город" in q or "города" in q) and "канал" not in q:
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="best_cities_vague",
                clarification_question=(
                    "Что считать «лучшими городами»: по выручке, количеству заказов, "
                    "поездкам, конверсии или отменам?"
                ),
                clarification_options=list(OPTIONS_SALES_METRICS),
            )

        if "активност" in q and not re.search(r"пассажир|водител|заказ", q):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="activity_scope_vague",
                clarification_question="Активность пассажиров, водителей или заказов?",
                clarification_options=[
                    ClarificationOption(label="Пассажиры (дневные метрики)", value="passenger_daily_metrics"),
                    ClarificationOption(label="Водители (дневные метрики)", value="driver_daily_metrics"),
                    ClarificationOption(label="Заказы (детальные события incity_orders)", value="incity_orders"),
                ],
            )

        if "отмен" in q and not re.search(
            r"клиент|пассажир|водител|после принят|после старт|после начал|после начала поезд|client|driver",
            q,
        ):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="cancellations_scope_vague",
                clarification_question=(
                    "Показать отмены пассажира (timestamp в incity_orders), отмены водителя "
                    "или отмены после принятия (агрегат client_cancel_after_accept)?"
                ),
                clarification_options=[
                    ClarificationOption(label="Отмены пассажира (clientcancel_timestamp)", value="client_cancel_ts"),
                    ClarificationOption(label="Отмены водителя (drivercancel_timestamp)", value="driver_cancel_ts"),
                    ClarificationOption(
                        label="Отмены после принятия (passenger_daily_metrics)",
                        value="cancel_after_accept_daily",
                    ),
                ],
            )

        dims = ctx.entities.get("dimensions") if isinstance(ctx.entities.get("dimensions"), list) else []
        if ctx.entities.get("scope") == "network" and "city_id" in dims:
            # «По всем городам» ≠ противоречие network vs city_id — это фильтр охвата, не группировка.
            if not implies_aggregate_across_all_cities(q):
                return ClarificationResponse(
                    clarification_required=True,
                    clarification_reason="scope_conflict_network_vs_city",
                    clarification_question="Вы указали и «по всей сети», и разрез по городам. Оставить общесетевой итог или группировку по городам?",
                    clarification_options=[
                        ClarificationOption(label="Только по всей сети (без группировки по городам)", value="scope_network_only"),
                        ClarificationOption(label="В разрезе городов (снять ограничение «по всей сети»)", value="scope_city_breakdown"),
                    ],
                )

        if "конверси" in q and not re.search(r"принят|поезд|тендер", q):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="conversion_type_vague",
                clarification_question=(
                    "Какую конверсию показать: заказы → поездки, тендеры → принятие или доля отмен после принятия?"
                ),
                clarification_options=[
                    ClarificationOption(label="Заказы → поездки (rides/orders)", value="ride_conversion"),
                    ClarificationOption(label="Тендеры → принятие (accepted/with tenders)", value="acceptance_rate"),
                    ClarificationOption(
                        label="Отмены после принятия / заказы",
                        value="cancel_after_accept_rate",
                    ),
                ],
            )

        if "лучш" in q and "канал" in q:
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="best_channels_vague",
                clarification_question=(
                    "Что считать «лучшими каналами»? "
                    "Максимальная выручка, конверсия, число заказов или другой показатель из словаря метрик."
                ),
                clarification_options=list(OPTIONS_CHANNEL_METRICS),
            )

        if ("канал" in q or "каналы" in q) and any(
            x in q for x in ("эффективн", "эффективные", "эффективна", "эффективных")
        ):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="channel_effectiveness_metric_unclear",
                clarification_question=(
                    "Под «эффективностью каналов» что важнее: выручка, число заказов, "
                    "конверсия в завершённую поездку или средний чек?"
                ),
                clarification_options=list(OPTIONS_CHANNEL_EFFECTIVENESS),
            )

        if (
            not ctx.entities.get("driver_efficiency_slice_q1_by_city")
            and any(x in q for x in ("успешн", "проблемн", "эффективн", "активн"))
            and nd == 0
        ):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="vague_performance_adjective",
                clarification_question="Уточните метрику: что именно считать успехом или проблемой?",
                clarification_options=list(OPTIONS_SUMMARY_METRICS),
            )

        if interp and ("revenue_metric_multiple" in interp.ambiguities or "revenue_definition_unclear" in interp.ambiguities):
            if not ctx.entities.get("multi_kpi_last_full_month_by_city"):
                return ClarificationResponse(
                    clarification_required=True,
                    clarification_reason="revenue_definition_ambiguous",
                    clarification_question=(
                        "Что вы имеете в виду под «выручкой»: сумму цен заказов, "
                        "число завершённых поездок или средний чек?"
                    ),
                    clarification_options=list(OPTIONS_REVENUE_DEFINITION),
                )

        if any(x in q for x in ("плох", "худш", "worst")) and any(x in q for x in ("город", "города", "city")):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="vague_quality_cities",
                clarification_question="Что именно считать «плохими» городами: больше отмен, ниже выручку или ниже конверсию?",
                clarification_options=list(OPTIONS_SALES_METRICS),
            )

        if interp and ("best_metric_unspecified" in interp.ambiguities or "ranking_metric_missing" in interp.ambiguities):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="best_metric_unspecified",
                clarification_question="Что считать «лучшими»: больше заказов, меньше отмен или выше средний чек?",
                clarification_options=list(OPTIONS_CHANNEL_METRICS),
            )

        if interp and "city_scope_all_vs_one" in interp.ambiguities:
            if ctx.entities.get("scope") == "network" or re.search(
                r"по\s+всем\s+город|всех\s+город|все\s+город\b|все\s+города|(?:по|для|во)\s+все[мх]?\s+город|(всем|всех|все)\s+город|по\s+всей\s+сети|вся\s+сеть",
                q,
            ):
                pass
            else:
                return ClarificationResponse(
                    clarification_required=True,
                    clarification_reason="city_scope_ambiguous",
                    clarification_question="Сравнить или ранжировать по всем городам или сфокусироваться на одном городе?",
                    clarification_options=list(OPTIONS_CITY_SCOPE),
                )


        if (
            interp
            and interp.confidence_band == "low"
            and interp.ambiguities
            and interp.confidence_score < 0.45
        ):
            opts = OPTIONS_CHANNEL_METRICS if ctx.intent == "ranking" else OPTIONS_SUMMARY_METRICS
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="low_interpretation_confidence",
                clarification_question="Запрос недостаточно однозначен. Уточните метрику, период или измерение.",
                clarification_options=list(opts),
            )

        if (
            ctx.intent == "comparison"
            and self._mentions_past_period(q)
            and not ctx.entities.get("compare_baseline")
        ):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="comparison_baseline_unspecified",
                clarification_question="С чем сравниваем «прошлый» период?",
                clarification_options=list(OPTIONS_BASELINE_COMPARE),
            )

        if (
            ctx.intent == "ranking"
            and nd == 0
            and self._mentions_dimension_hint(q)
            and not ctx.entities.get("lost_orders_before_driver_accept_top")
        ):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="ranking_metric_unspecified",
                clarification_question="По какой метрике ранжировать city_id или статусы?",
                clarification_options=list(OPTIONS_CHANNEL_METRICS),
            )

        if nd == 0 and ("продаж" in q or "sales" in q):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="sales_metric_unspecified",
                clarification_question="Что именно считать «продажами»?",
                clarification_options=list(OPTIONS_SALES_METRICS),
            )

        if (
            ctx.intent == "comparison"
            and ("эффектив" in q or "efficiency" in q)
            and nd == 0
            and not ctx.entities.get("driver_efficiency_slice_q1_by_city")
        ):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="effectiveness_metric_unspecified",
                clarification_question="Как измеряем эффективность?",
                clarification_options=list(OPTIONS_EFFECTIVENESS_METRICS),
            )

        if ctx.intent == "trend" and nd == 0 and ("динамик" in q or "dynamic" in q):
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="trend_metric_unspecified",
                clarification_question="Какую метрику показать в динамике?",
                clarification_options=list(OPTIONS_SALES_METRICS),
            )

        if ctx.intent in ("trend", "forecast") and "time_grain" not in ctx.entities:
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="time_grain_unspecified",
                clarification_question="За какой период и с каким шагом агрегировать?",
                clarification_options=list(OPTIONS_TIME_GRAIN),
            )

        if ctx.intent == "summary" and nd == 0:
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="summary_metric_unspecified",
                clarification_question="Какую метрику показать в сводке?",
                clarification_options=list(OPTIONS_SUMMARY_METRICS),
            )

        if ctx.intent == "comparison" and nd == 0 and len(q.split()) <= 6:
            return ClarificationResponse(
                clarification_required=True,
                clarification_reason="comparison_dimension_unspecified",
                clarification_question="Что именно сравниваем?",
                clarification_options=list(OPTIONS_GENERIC_COMPARE_DIMENSION),
            )

        return ClarificationResponse(clarification_required=False)

    def score_confidence(
        self,
        resolutions: List[SemanticTermResolution],
        intent_signals: List[str],
        clarification: ClarificationResponse,
        interpretation: Optional[NLQueryInterpretation] = None,
    ) -> float:
        """Higher when interpretation is concrete; capped low when clarification is required."""
        base = 0.88
        if not resolutions or resolutions[0].surface_form == "default":
            base -= 0.12
        if resolutions and resolutions[0].confidence < 0.72:
            base -= 0.08
        if any("default:" in s for s in intent_signals):
            base -= 0.04
        if interpretation is not None:
            base = 0.45 * base + 0.55 * float(interpretation.confidence_score)
        if interpretation is not None and interpretation.entities.get("funnel_two_stage_conversion"):
            base = max(base, 0.82)
        if interpretation is not None and interpretation.entities.get("metric_hint") == "unique_client_cancels_after_start":
            base = max(base, 0.82)
        if interpretation is not None and interpretation.entities.get("multi_kpi_last_full_month_by_city"):
            base = max(base, 0.84)
        if interpretation is not None and interpretation.entities.get("lost_orders_before_driver_accept_top"):
            base = max(base, 0.84)
        if interpretation is not None and interpretation.entities.get("driver_efficiency_slice_q1_by_city"):
            base = max(base, 0.84)
        if clarification.clarification_required:
            # Band for under-specified queries (product default ~0.58).
            if not resolutions or resolutions[0].surface_form == "default":
                cap = 0.58
                if interpretation is not None:
                    cap = min(cap, float(interpretation.confidence_score))
                return round(cap, 2)
            cap = 0.62
            if interpretation is not None:
                cap = min(cap, float(interpretation.confidence_score))
            return round(cap, 2)
        return round(max(0.25, min(1.0, base)), 2)

    @staticmethod
    def _mentions_dimension_hint(q: str) -> bool:
        return any(
            token in q
            for token in (
                "город",
                "city",
                "статус",
                "status",
            )
        )

    @staticmethod
    def _mentions_past_period(q: str) -> bool:
        return (
            "прошл" in q
            or "в прошлом" in q
            or "year over year" in q
            or "yoy" in q.split()
            or "год назад" in q
        )

    @staticmethod
    def _has_explicit_metric(query: str) -> bool:
        q = query.lower()
        return bool(
            re.search(r"количеств\w*\s+отмен", q)
            or re.search(r"отмен[её]н\w*\s+заказ", q)
            or re.search(r"отмен\w*.*после\s+(старт|начал|начала)\w*", q)
            or "cancelled orders" in q
            or "total cancellations" in q
        )

    @staticmethod
    def _has_explicit_two_stage_conversion(query: str) -> bool:
        q = query.lower()
        has_conversion = "конверси" in q or "conversion" in q
        has_accept_stage = bool(re.search(r"принят|accepted|acceptance|тендер", q))
        has_complete_stage = bool(re.search(r"заверш|поездк|ride|done", q))
        return has_conversion and has_accept_stage and has_complete_stage

    @staticmethod
    def _has_high_specificity_business_query(query: str) -> bool:
        q = query.lower()
        has_time = bool(
            re.search(r"\b20[0-9]{2}\b", q)
            or re.search(r"\bq[1-4]\b", q)
            or re.search(r"январ|феврал|март|апрел|мая|май|июн|июл|август|сентябр|октябр|ноябр|декабр", q)
            or re.search(r"last month|за последний", q)
        )
        has_dimension = bool(re.search(r"по\s+город|в\s+разрезе|по\s+дням|по\s+месяц|город", q))
        has_metric_signal = bool(
            re.search(r"конверси|отмен|выруч|средн(ий|его)\s+чек|заказ|принят|заверш|rides|online", q)
        )
        return has_time and has_dimension and has_metric_signal
