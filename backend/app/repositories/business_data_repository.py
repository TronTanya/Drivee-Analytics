from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


class BusinessDataRepository:
    """Access helpers for canonical anonymized in-city orders dataset."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def source_table(self) -> str:
        return "public.anonymized_incity_orders"

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
                FROM public.anonymized_incity_orders
                ORDER BY order_timestamp DESC NULLS LAST
                LIMIT :limit
                """
            ),
            {"limit": max(1, min(limit, 5000))},
        ).mappings()
        return [dict(r) for r in rows]

