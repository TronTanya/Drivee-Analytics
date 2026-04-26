"""Dashboards and auto-builder suggestion API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class SuggestedWidget(BaseModel):
    title: str
    chart_type: str
    metric_key: Optional[str] = None
    intent: Optional[str] = None
    scenario_key: Optional[str] = None


class DashboardSuggestionResponse(BaseModel):
    suggest_dashboard: bool
    reason: str
    suggested_widgets: list[SuggestedWidget] = Field(default_factory=list)
    history_sample_size: int = 0
    recurring_scenarios: int = 0


class TrainDatasetSummaryResponse(BaseModel):
    """Агрегаты по каноническому слою `public.incity_orders`; для согласованных KPI на дашборде."""

    source_table: str = Field(default="public.incity_orders", description="Имя поверхности в БД.")
    train_row_count: int = Field(..., ge=0, description="Строки выборки заказ×тендер.")
    distinct_orders: int = Field(..., ge=0)
    done_rides: int = Field(..., ge=0)
    cancellations_total: int = Field(..., ge=0)
    order_timestamp_min: Optional[datetime] = None
    order_timestamp_max: Optional[datetime] = None
    sum_order_price: Optional[float] = Field(
        default=None,
        description="Сумма price_order_local; не отдаётся роли executive.",
    )


class DashboardWidgetCreateItem(BaseModel):
    title: str = Field(..., min_length=1)
    chart_type: str = Field(..., min_length=1)
    metric_key: Optional[str] = None
    width: int = Field(6, ge=2, le=12)
    height: int = Field(3, ge=2, le=12)
    config_json: dict[str, Any] = Field(default_factory=dict)


class CreateAutoDashboardRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=256)
    description: Optional[str] = None
    widgets: list[DashboardWidgetCreateItem] = Field(..., min_length=1)


class DashboardWidgetResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    title: str
    widget_type: str
    chart_type: Optional[str]
    metric_key: Optional[str]
    position_x: int
    position_y: int
    width: int
    height: int
    config_json: dict[str, Any]


class DashboardDetailResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    workspace_id: uuid.UUID
    owner_user_id: Optional[uuid.UUID]
    title: str
    description: Optional[str]
    is_auto_generated: bool
    layout_json: dict[str, Any]
    source_history_window_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    widgets: list[DashboardWidgetResponse] = Field(default_factory=list)
