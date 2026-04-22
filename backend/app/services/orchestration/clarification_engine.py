"""Rules-first clarification: if the query is under-specified, ask instead of defaulting."""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, List, Optional

from app.schemas.clarification import ClarificationOption, ClarificationResponse
from app.schemas.orchestration import IntentKind, SemanticTermResolution
from app.services.llm.llm_service import LLMService


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


@dataclass
class ClarificationContext:
    effective_query: str
    intent: IntentKind
    entities: dict[str, Any]
    resolutions: List[SemanticTermResolution]
    nondefault_semantic_count: int
    intent_signals: List[str]


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

        llm = self._llm.generate_clarification(
            query=ctx.effective_query,
            intent=ctx.intent,
            entities=ctx.entities,
            semantic_terms=[r.model_dump() for r in ctx.resolutions],
        )
        if llm is None:
            return rules_response

        # Keep deterministic behaviour for explicit metric wording.
        if llm.clarification_required and self._has_explicit_metric(ctx.effective_query):
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

        if ctx.intent == "ranking" and nd == 0 and self._mentions_dimension_hint(q):
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

        if ctx.intent == "comparison" and ("эффектив" in q or "efficiency" in q) and nd == 0:
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
    ) -> float:
        """Higher when interpretation is concrete; capped low when clarification is required."""
        base = 0.88
        if not resolutions or resolutions[0].surface_form == "default":
            base -= 0.12
        if resolutions and resolutions[0].confidence < 0.72:
            base -= 0.08
        if any("default:" in s for s in intent_signals):
            base -= 0.04
        if clarification.clarification_required:
            # Band for under-specified queries (product default ~0.58).
            if not resolutions or resolutions[0].surface_form == "default":
                return 0.58
            return 0.62
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
            or "cancelled orders" in q
            or "total cancellations" in q
        )
