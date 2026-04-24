from __future__ import annotations

from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings


class BusinessDataRepository:
    """Access helpers для канонического датасета заказов (аналитическое имя public.train)."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def source_table(self) -> str:
        return "public.train"

    def sample_orders(self, limit: int = 100) -> list[dict]:
        rows = self.session.execute(
            text(
                """
                SELECT
                    city_id,
                    offset_hours,
                    order_id,
                    tender_id,
                    user_id,
                    driver_id,
                    status_order,
                    status_tender,
                    order_timestamp,
                    tender_timestamp,
                    driveraccept_timestamp,
                    driverarrived_timestamp,
                    driverstarttheride_timestamp,
                    driverdone_timestamp,
                    clientcancel_timestamp,
                    drivercancel_timestamp,
                    order_modified_local,
                    cancel_before_accept_local,
                    distance_in_meters,
                    duration_in_seconds,
                    price_order_local,
                    price_tender_local,
                    price_start_local
                FROM public.train
                ORDER BY order_timestamp DESC NULLS LAST
                LIMIT :limit
                """
            ),
            {"limit": max(1, min(limit, 5000))},
        ).mappings()
        return [dict(r) for r in rows]

    def fetch_train_global_summary(self) -> dict[str, Any]:
        """Один запрос агрегатов по каноническому VIEW `public.train` (не staging)."""
        source = "public.train"
        if settings.mock_mode:
            return {
                "source_table": source,
                "train_row_count": 12_480,
                "distinct_orders": 8_420,
                "done_rides": 9_100,
                "cancellations_total": 1_740,
                "order_timestamp_min": None,
                "order_timestamp_max": None,
                "sum_order_price": 3_450_000.5,
            }
        row = self.session.execute(
            text(
                """
                SELECT
                    COUNT(*)::bigint AS train_row_count,
                    COUNT(DISTINCT order_id)::bigint AS distinct_orders,
                    COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL)::bigint AS done_rides,
                    COUNT(*) FILTER (
                        WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL
                    )::bigint AS cancellations_total,
                    MIN(order_timestamp) AS order_timestamp_min,
                    MAX(order_timestamp) AS order_timestamp_max,
                    COALESCE(SUM(price_order_local), 0)::numeric(18, 2) AS sum_order_price
                FROM public.train
                """
            )
        ).mappings().first()
        if not row:
            return {
                "source_table": source,
                "train_row_count": 0,
                "distinct_orders": 0,
                "done_rides": 0,
                "cancellations_total": 0,
                "order_timestamp_min": None,
                "order_timestamp_max": None,
                "sum_order_price": 0.0,
            }
        d = dict(row)
        return {
            "source_table": source,
            "train_row_count": int(d.get("train_row_count") or 0),
            "distinct_orders": int(d.get("distinct_orders") or 0),
            "done_rides": int(d.get("done_rides") or 0),
            "cancellations_total": int(d.get("cancellations_total") or 0),
            "order_timestamp_min": d.get("order_timestamp_min"),
            "order_timestamp_max": d.get("order_timestamp_max"),
            "sum_order_price": _coerce_float(d.get("sum_order_price")),
        }


def _coerce_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return None

