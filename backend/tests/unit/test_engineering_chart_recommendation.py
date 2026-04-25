"""Unit: рекомендация графика по intent + схеме результата (ChartRecommendationService)."""

from __future__ import annotations

import pytest

from app.services.orchestration.chart_recommendation_service import ChartRecommendationService
from tests.fixtures.demo_orders import (
    DEMO_ORDER_ROWS,
    demo_channel_mix,
    multi_period_revenue_rows,
    ranking_cancellations_by_city,
)


@pytest.fixture
def charts() -> ChartRecommendationService:
    return ChartRecommendationService()


def test_ranking_cancellations_by_city_horizontal_bar(charts: ChartRecommendationService) -> None:
    rows = ranking_cancellations_by_city()
    cols = list(rows[0].keys()) if rows else []
    viz = charts.recommend("ranking", cols, rows, effective_query="топ городов по отменам")
    assert viz.recommended_chart_type == "horizontal_bar"
    assert "table" in viz.alternative_chart_types


def test_trend_multi_period_line(charts: ChartRecommendationService) -> None:
    rows = multi_period_revenue_rows()
    cols = list(rows[0].keys())
    viz = charts.recommend("trend", cols, rows, effective_query="динамика выручки по дням")
    assert viz.recommended_chart_type == "line"
    assert "table" in viz.alternative_chart_types


def test_share_conversion_donut(charts: ChartRecommendationService) -> None:
    rows = demo_channel_mix()
    cols = list(rows[0].keys())
    viz = charts.recommend("share", cols, rows, effective_query="доля каналов и конверсия")
    assert viz.recommended_chart_type == "donut"
    assert "pie" in viz.alternative_chart_types
    assert "table" in viz.alternative_chart_types


def test_keyword_dolya_prefers_donut_even_without_share_intent(charts: ChartRecommendationService) -> None:
    rows = [{"city_id": "1", "cancel_share": 0.12}, {"city_id": "2", "cancel_share": 0.18}]
    cols = ["city_id", "cancel_share"]
    viz = charts.recommend("summary", cols, rows, effective_query="покажи долю отмен по городам")
    assert viz.recommended_chart_type == "donut"


def test_keyword_izmenenie_prefers_line(charts: ChartRecommendationService) -> None:
    rows = [{"date": "2026-04-01", "value": 10}, {"date": "2026-04-02", "value": 15}]
    cols = ["date", "value"]
    viz = charts.recommend("summary", cols, rows, effective_query="покажи изменение заказов по дням")
    assert viz.recommended_chart_type == "line"


def test_fixture_orders_profile_numeric_columns(charts: ChartRecommendationService) -> None:
    slim = [{k: v for k, v in row.items() if k in ("order_timestamp", "price_order_local", "status_order")} for row in DEMO_ORDER_ROWS]
    cols = list(slim[0].keys())
    viz = charts.recommend("summary", cols, slim, effective_query="сводка по заказам без гео-измерения")
    assert viz.recommended_chart_type in ("table", "bar", "line")


def test_geo_query_populates_map_features(charts: ChartRecommendationService) -> None:
    rows = ranking_cancellations_by_city()
    cols = list(rows[0].keys())
    viz = charts.recommend("ranking", cols, rows, effective_query="покажи отмены по городам на карте")
    assert viz.recommended_chart_type in ("map", "geo_bubble", "horizontal_bar")
    assert viz.geo_metadata is not None
    assert viz.geo_metadata.geo_enabled
    assert len(viz.geo_metadata.map_features) >= 1
    assert "table" in viz.alternative_chart_types


def test_geo_context_table_when_no_metric_for_map(charts: ChartRecommendationService) -> None:
    """Гео-запрос без числовой метрики — только таблица (карта недоступна честно)."""
    rows = [{"city_id": "Алматы"}, {"city_id": "Астана"}]
    cols = ["city_id"]
    viz = charts.recommend("summary", cols, rows, effective_query="покажи города на карте")
    assert viz.recommended_chart_type == "table"
    assert viz.geo_metadata is not None
    assert viz.geo_metadata.geo_enabled
    assert "horizontal_bar" in viz.alternative_chart_types


def test_scatter_two_numeric_without_time(charts: ChartRecommendationService) -> None:
    rows = [{"a": 1.0, "b": 2.0}, {"a": 3.0, "b": 5.5}]
    cols = ["a", "b"]
    viz = charts.recommend("summary", cols, rows, effective_query="")
    assert viz.recommended_chart_type == "scatter"
    assert "table" in viz.alternative_chart_types


def test_single_row_two_numeric_counts_horizontal_bar_not_scatter(charts: ChartRecommendationService) -> None:
    """Одна строка с двумя счётчиками — сравнение KPI, не точечная «корреляция» (одна точка)."""
    rows = [{"accepted_rows": 9048, "cancelled_rows": 270}]
    cols = ["accepted_rows", "cancelled_rows"]
    viz = charts.recommend("summary", cols, rows, effective_query="сколько принятых и отменённых в городе 67")
    assert viz.recommended_chart_type == "horizontal_bar"
    assert "scatter" in viz.alternative_chart_types
    assert "table" in viz.alternative_chart_types
