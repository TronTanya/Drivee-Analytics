from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AnonymizedIncityOrderSchema(BaseModel):
    city_id: str
    offset_hours: int
    order_id: str
    tender_id: str
    user_id: str
    driver_id: str

    status_order: str
    status_tender: str

    order_timestamp: Optional[datetime] = None
    tender_timestamp: Optional[datetime] = None
    driveraccept_timestamp: Optional[datetime] = None
    driverarrived_timestamp: Optional[datetime] = None
    driverstarttheride_timestamp: Optional[datetime] = None
    driverdone_timestamp: Optional[datetime] = None
    clientcancel_timestamp: Optional[datetime] = None
    drivercancel_timestamp: Optional[datetime] = None
    order_modified_local: Optional[datetime] = None
    cancel_before_accept_local: Optional[datetime] = None

    distance_in_meters: Optional[float] = None
    duration_in_seconds: Optional[float] = None
    price_order_local: Optional[float] = None
    price_tender_local: Optional[float] = None
    price_start_local: Optional[float] = None

