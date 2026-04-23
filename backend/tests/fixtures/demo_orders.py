"""
Реалистичные демо-ряды для тестов (не привязаны к живой БД).

Покрывают: несколько городов, периоды (день/неделя), каналы (status_tender),
отмены / завершённые / выручка / конверсия.
"""

from __future__ import annotations

from typing import Any

DEMO_CITIES = ("Алматы", "Астана", "Шымкент", "Караганда")

# Упрощённая схема полей, совместимая с профилированием ChartRecommendationService
DEMO_ORDER_ROWS: list[dict[str, Any]] = [
    {
        "city_id": "Алматы",
        "order_timestamp": "2026-04-18T10:00:00Z",
        "status_order": "cancelled",
        "status_tender": "client_cancelled",
        "price_order_local": 1800,
        "channel": "app",
    },
    {
        "city_id": "Алматы",
        "order_timestamp": "2026-04-19T11:00:00Z",
        "status_order": "done",
        "status_tender": "completed",
        "price_order_local": 2100,
        "channel": "app",
    },
    {
        "city_id": "Астана",
        "order_timestamp": "2026-04-19T12:00:00Z",
        "status_order": "cancelled",
        "status_tender": "driver_timeout",
        "price_order_local": 1650,
        "channel": "web",
    },
    {
        "city_id": "Астана",
        "order_timestamp": "2026-04-20T08:30:00Z",
        "status_order": "done",
        "status_tender": "completed",
        "price_order_local": 2400,
        "channel": "web",
    },
    {
        "city_id": "Шымкент",
        "order_timestamp": "2026-04-20T09:00:00Z",
        "status_order": "cancelled",
        "status_tender": "client_cancelled",
        "price_order_local": 1200,
        "channel": "partner",
    },
    {
        "city_id": "Шымкент",
        "order_timestamp": "2026-04-21T14:00:00Z",
        "status_order": "done",
        "status_tender": "completed",
        "price_order_local": 1350,
        "channel": "partner",
    },
    {
        "city_id": "Караганда",
        "order_timestamp": "2026-04-21T15:00:00Z",
        "status_order": "done",
        "status_tender": "completed",
        "price_order_local": 1900,
        "channel": "app",
    },
]


def ranking_cancellations_by_city(rows: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    src = rows or DEMO_ORDER_ROWS
    acc: dict[str, dict[str, Any]] = {}
    for r in src:
        if r.get("status_order") != "cancelled":
            continue
        cid = str(r["city_id"])
        acc.setdefault(cid, {"city_id": cid, "cancelled_orders": 0, "revenue_lost": 0.0})
        acc[cid]["cancelled_orders"] += 1
        acc[cid]["revenue_lost"] += float(r.get("price_order_local") or 0)
    out = sorted(acc.values(), key=lambda x: (-x["cancelled_orders"], x["city_id"]))
    return out


def multi_period_revenue_rows() -> list[dict[str, Any]]:
    """Временной ряд без city_id — чтобы ChartRecommendation не уходил в geo-ветку."""
    return [
        {"day": "2026-04-18", "revenue": 12000.0, "orders": 8},
        {"day": "2026-04-19", "revenue": 15000.0, "orders": 9},
        {"day": "2026-04-20", "revenue": 14200.0, "orders": 10},
    ]


def demo_channel_mix() -> list[dict[str, Any]]:
    return [
        {"channel": "app", "orders": 120, "done": 95, "conversion": 0.79},
        {"channel": "web", "orders": 80, "done": 58, "conversion": 0.725},
        {"channel": "partner", "orders": 40, "done": 30, "conversion": 0.75},
    ]
