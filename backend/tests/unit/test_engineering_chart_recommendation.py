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
    assert viz.recommended_chart_type in ("horizontal_bar", "bar", "map")
    assert viz.visualization_confidence >= 0.7


def test_trend_multi_period_line(charts: ChartRecommendationService) -> None:
    rows = multi_period_revenue_rows()
    cols = list(rows[0].keys())
    viz = charts.recommend("trend", cols, rows, effective_query="динамика выручки по дням")
    assert viz.recommended_chart_type in ("line", "combo", "area", "bar")


def test_share_conversion_donut(charts: ChartRecommendationService) -> None:
    rows = demo_channel_mix()
    cols = list(rows[0].keys())
    viz = charts.recommend("share", cols, rows, effective_query="доля каналов и конверсия")
    assert viz.recommended_chart_type in ("donut", "pie", "bar", "stacked_bar")


def test_fixture_orders_profile_numeric_columns(charts: ChartRecommendationService) -> None:
    slim = [{k: v for k, v in row.items() if k in ("order_timestamp", "price_order_local", "status_order")} for row in DEMO_ORDER_ROWS]
    cols = list(slim[0].keys())
    viz = charts.recommend("summary", cols, slim, effective_query="сводка по заказам без гео-измерения")
    assert viz.recommended_chart_type in ("table", "bar", "line", "heatmap")
