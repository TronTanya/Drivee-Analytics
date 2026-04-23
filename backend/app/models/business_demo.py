from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AnonymizedIncityOrder(Base):
    """
    Canonical business entity: one row per anonymized order_id + tender_id tuple.
    """

    __tablename__ = "anonymized_incity_orders"

    city_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    tender_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    driver_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    offset_hours: Mapped[int] = mapped_column(BigInteger, nullable=False)

    status_order: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status_tender: Mapped[str] = mapped_column(String(64), nullable=False, index=True)

    order_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    tender_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    driveraccept_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    driverarrived_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    driverstarttheride_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    driverdone_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    clientcancel_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    drivercancel_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    order_modified_local: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_before_accept_local: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    distance_in_meters: Mapped[Optional[float]] = mapped_column(Numeric(18, 3), nullable=True)
    duration_in_seconds: Mapped[Optional[float]] = mapped_column(Numeric(18, 3), nullable=True)
    price_order_local: Mapped[Optional[float]] = mapped_column(Numeric(18, 3), nullable=True)
    price_tender_local: Mapped[Optional[float]] = mapped_column(Numeric(18, 3), nullable=True)
    price_start_local: Mapped[Optional[float]] = mapped_column(Numeric(18, 3), nullable=True)
    order_channel: Mapped[str] = mapped_column(String(64), nullable=False, server_default="unknown", index=True)
