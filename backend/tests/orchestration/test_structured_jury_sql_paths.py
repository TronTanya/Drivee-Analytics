"""Три «жюри»-сценария: без уточнений, детерминированный SQL (multi-KPI, pre-accept, driver Q1)."""

from __future__ import annotations

import pytest

from app.schemas.nl_interpretation import NLQueryInterpretation
from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.sql_generation_service import SQLGenerationService
from app.schemas.orchestration import SemanticTermResolution


def _interp(**kwargs: object) -> NLQueryInterpretation:
    base = dict(
        intent="comparison",
        metric="sum_order_price",
        entities={},
        metrics=["sum_order_price"],
        dimensions=["city_id"],
        filters={},
        ambiguities=[],
        ambiguity_flags=[],
        confidence_score=0.78,
        confidence_band="medium",
        source_signals=["rules:test"],
    )
    base.update(kwargs)
    return NLQueryInterpretation.model_validate(base)


@pytest.fixture
def intent_svc() -> IntentService:
    return IntentService(llm_service=None)


def test_extract_multi_kpi_last_full_month_by_city(intent_svc: IntentService) -> None:
    q = (
        "За последний полный месяц посчитай выручку, завершённые поездки "
        "и средний чек по каждому городу"
    )
    ent = intent_svc.extract_entities(q)
    assert ent.get("multi_kpi_last_full_month_by_city") is True
    assert ent.get("time_period") == "last_full_calendar_month"
    assert "city_id" in (ent.get("dimensions") or [])


def test_extract_lost_orders_before_accept_top(intent_svc: IntentService) -> None:
    q = "Топ-3 городов, теряющих заказы на этапе до принятия водителем в 2025"
    ent = intent_svc.extract_entities(q)
    assert ent.get("lost_orders_before_driver_accept_top") is True
    assert ent.get("metric_hint") == "cancel_before_accept_count"
    assert ent.get("top_n") == 3


def test_extract_driver_efficiency_q1_slice(intent_svc: IntentService) -> None:
    q = (
        "Сделай срез эффективности водителей по городам за Q1 2025: "
        "rides, online hours, rides per online hour"
    )
    ent = intent_svc.extract_entities(q)
    assert ent.get("driver_efficiency_slice_q1_by_city") is True
    assert ent.get("metric_hint") == "mpit_driver_rides_count"


def test_sql_multi_kpi_contains_columns() -> None:
    gen = SQLGenerationService()
    sql = gen.generate(
        "comparison",
        {
            "multi_kpi_last_full_month_by_city": True,
            "time_period": "last_full_calendar_month",
            "dimensions": ["city_id"],
        },
        "SUM(a.price_order_local)",
        use_campaigns_only=False,
        workspace_id=None,
        source_table="public.incity_orders",
    )
    assert "revenue_gmv" in sql
    assert "completed_rides" in sql
    assert "avg_check" in sql
    assert "date_trunc('month', current_date)" in sql


def test_sql_lost_orders_cancel_before_accept() -> None:
    gen = SQLGenerationService()
    sql = gen.generate(
        "ranking",
        {
            "lost_orders_before_driver_accept_top": True,
            "calendar_year": 2025,
            "top_n": 3,
            "dimensions": ["city_id"],
        },
        "COUNT(CASE WHEN a.cancel_before_accept_local IS NOT NULL THEN 1 END)",
        use_campaigns_only=False,
        workspace_id=None,
        source_table="public.incity_orders",
    )
    assert "cancel_before_accept_local" in sql
    assert "LIMIT 3" in sql
    assert "EXTRACT(YEAR" in sql


def test_sql_driver_q1_driver_daily_metrics() -> None:
    gen = SQLGenerationService()
    sql = gen.generate(
        "comparison",
        {"driver_efficiency_slice_q1_by_city": True, "calendar_year": 2025, "dimensions": ["city_id"]},
        "SUM(a.rides_count)",
        use_campaigns_only=False,
        workspace_id=None,
        source_table="public.incity_orders",
    )
    assert "rides_per_online_hour" in sql
    assert "online_hours" in sql
    assert "driver_daily_metrics" in sql.lower()
    assert "2025-01-01" in sql and "2025-04-01" in sql


def test_clarification_skips_for_structured_entities() -> None:
    eng = ClarificationEngine(llm_service=None)
    res = SemanticTermResolution(
        term_key="sum_order_price",
        surface_form="interpretation",
        sql_fragment="SUM(a.price_order_local)",
        confidence=0.9,
    )
    interp = _interp(
        entities={"multi_kpi_last_full_month_by_city": True},
        ambiguities=["revenue_metric_multiple"],
    )
    out = eng.evaluate(
        ClarificationContext(
            effective_query="выручка и поездки за месяц по городам",
            intent="comparison",
            entities={"multi_kpi_last_full_month_by_city": True},
            resolutions=[res],
            nondefault_semantic_count=1,
            intent_signals=["keyword:comparison:разрез"],
            interpretation=interp,
        )
    )
    assert out.clarification_required is False

    interp2 = _interp(
        intent="ranking",
        entities={"lost_orders_before_driver_accept_top": True},
        metrics=["cancel_before_accept_count"],
    )
    out2 = eng.evaluate(
        ClarificationContext(
            effective_query="топ городов до принятия водителем",
            intent="ranking",
            entities={"lost_orders_before_driver_accept_top": True, "top_n": 3},
            resolutions=[res],
            nondefault_semantic_count=0,
            intent_signals=["keyword:ranking:топ"],
            interpretation=interp2,
        )
    )
    assert out2.clarification_required is False

    interp3 = _interp(
        entities={"driver_efficiency_slice_q1_by_city": True},
        metric="mpit_driver_rides_count",
    )
    out3 = eng.evaluate(
        ClarificationContext(
            effective_query="срез эффективности водителей q1 2025 rides online",
            intent="comparison",
            entities={"driver_efficiency_slice_q1_by_city": True},
            resolutions=[res],
            nondefault_semantic_count=1,
            intent_signals=[],
            interpretation=interp3,
        )
    )
    assert out3.clarification_required is False


def test_extract_qr_accepted_start_price_daily_flag(intent_svc: IntentService) -> None:
    q = (
        "Сколько составляет качественная метрика (QR): количество заказов принятых по стартовой цене "
        "в течение 10 минут. В разрезе дня за февраль 2025 года по всем городам"
    )
    ent = intent_svc.extract_entities(q)
    assert ent.get("qr_accepted_at_start_price_within_10m_daily") is True
    assert ent.get("time_grain") == "day"
    assert ent.get("calendar_month") == 2
    assert ent.get("calendar_year") == 2025


def test_sql_qr_daily_bucket_value_feb_2025() -> None:
    gen = SQLGenerationService()
    sql = gen.generate(
        "trend",
        {
            "qr_accepted_at_start_price_within_10m_daily": True,
            "calendar_month": 2,
            "calendar_year": 2025,
            "time_grain": "day",
            "scope": "network",
        },
        "COUNT(*)",
        use_campaigns_only=False,
        workspace_id=None,
        source_table="public.incity_orders",
    )
    assert "date_trunc('day'" in sql or "::date AS bucket" in sql
    assert "10 minutes" in sql or "10 minutes'" in sql
    assert "price_order_local = a.price_start_local" in sql or "a.price_order_local = a.price_start_local" in sql
    assert "GROUP BY 1" in sql
    assert "make_timestamptz(2025, 2, 1" in sql
    assert "city_id::text AS dim" not in sql
