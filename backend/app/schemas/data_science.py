from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ColumnSchemaItem(BaseModel):
    original_name: str
    sanitized_name: str
    inferred_type: str
    pg_type: str
    null_ratio: float = 0.0


class UploadCreateResponse(BaseModel):
    upload_id: uuid.UUID
    import_job_id: uuid.UUID
    file_name: str
    file_size_bytes: int
    checksum_sha256: Optional[str]
    inferred_schema: dict[str, Any]
    metrics_preview: dict[str, Any] = Field(default_factory=dict)


class UploadListItem(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    file_name: str
    file_size_bytes: Optional[int]
    upload_status: str
    created_at: datetime


class UploadDetailResponse(BaseModel):
    upload: UploadListItem
    import_job_id: Optional[uuid.UUID]
    job_status: Optional[str]
    inferred_schema: dict[str, Any]
    metrics: dict[str, Any]
    transform: dict[str, Any] = Field(default_factory=dict)


class ImportPreviewResponse(BaseModel):
    upload_id: uuid.UUID
    sample_rows: list[dict[str, Any]]
    warnings: list[str]
    columns: list[dict[str, Any]]
    delimiter: str = ","


class ImportRunResponse(BaseModel):
    upload_id: uuid.UUID
    job_id: uuid.UUID
    qualified_table: str
    row_count: int
    semantic_column_map: dict[str, str] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)


class NotebookLinkUploadRequest(BaseModel):
    workspace_id: uuid.UUID
    upload_id: uuid.UUID


class NotebookLinkUploadResponse(BaseModel):
    notebook_id: uuid.UUID
    context_chain_json: dict[str, Any]


class ForecastRunRequest(BaseModel):
    workspace_id: uuid.UUID
    upload_id: Optional[uuid.UUID] = None
    source_table: Optional[str] = None
    date_column: Optional[str] = None
    horizon_days: int = Field(7, ge=1, le=30)
    notebook_id: Optional[uuid.UUID] = None
    preferred_strategy: Optional[str] = None


class AutoMLBacktestRequest(BaseModel):
    workspace_id: uuid.UUID
    upload_id: Optional[uuid.UUID] = None
    source_table: Optional[str] = None
    date_column: Optional[str] = None
    horizon_days: int = Field(14, ge=1, le=90)
    holdout_days: int = Field(14, ge=3, le=120)
    strategies: list[str] = Field(default_factory=list)


class ForecastRunResponse(BaseModel):
    forecast_run_id: Optional[uuid.UUID] = None
    workspace_id: uuid.UUID
    upload_id: Optional[uuid.UUID] = None
    source_table: Optional[str] = None
    date_column: str
    semantic_column_map: dict[str, str] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    forecasts: dict[str, Any] = Field(default_factory=dict)
    strategy_summary: dict[str, Any] = Field(default_factory=dict)
    insights: list[str] = Field(default_factory=list)


class AutoMLModelScore(BaseModel):
    strategy_key: str
    status: str
    mae: Optional[float] = None
    rmse: Optional[float] = None
    mape: Optional[float] = None
    score: Optional[float] = None
    backtest_points: int = 0
    backtest_preview: list[dict[str, Any]] = Field(default_factory=list)


class AutoMLForecastPoint(BaseModel):
    step: int
    date: str
    value: float


class AutoMLMetricLeaderboard(BaseModel):
    metric_key: str
    best_strategy: Optional[str] = None
    best_score: Optional[float] = None
    forecast_preview: list[AutoMLForecastPoint] = Field(default_factory=list)
    models: list[AutoMLModelScore] = Field(default_factory=list)


class AutoMLBacktestResponse(BaseModel):
    workspace_id: uuid.UUID
    upload_id: Optional[uuid.UUID] = None
    source_table: Optional[str] = None
    date_column: str
    horizon_days: int
    holdout_days: int
    strategy_candidates: list[str] = Field(default_factory=list)
    metrics_snapshot: dict[str, Any] = Field(default_factory=dict)
    leaderboards: list[AutoMLMetricLeaderboard] = Field(default_factory=list)


class ForecastResultPoint(BaseModel):
    step_index: int
    forecast_timestamp: datetime
    predicted_value: float
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    confidence_score: Optional[float] = None
    components: dict[str, Any] = Field(default_factory=dict)


class ForecastRunDetailResponse(BaseModel):
    forecast_run_id: uuid.UUID
    workspace_id: uuid.UUID
    notebook_id: Optional[uuid.UUID] = None
    report_id: Optional[uuid.UUID] = None
    metric_key: str
    method: str
    horizon_steps: int
    run_status: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_by: Optional[uuid.UUID] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    points: list[ForecastResultPoint] = Field(default_factory=list)
    anomalies: list[dict[str, Any]] = Field(default_factory=list)


class ForecastRunListItem(BaseModel):
    forecast_run_id: uuid.UUID
    workspace_id: uuid.UUID
    notebook_id: Optional[uuid.UUID] = None
    report_id: Optional[uuid.UUID] = None
    metric_key: str
    method: str
    horizon_steps: int
    run_status: str
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    points_count: int = 0
    anomalies_count: int = 0


class ForecastRunListResponse(BaseModel):
    items: list[ForecastRunListItem] = Field(default_factory=list)
    total: int = 0
    limit: int = 20
    offset: int = 0


class DefaultSourceProfileResponse(BaseModel):
    source_table: str
    row_count: int
    columns_count: int
    columns: list[dict[str, str]] = Field(default_factory=list)
    min_date: Optional[str] = None
    max_date: Optional[str] = None
    status_order_top: list[dict[str, Any]] = Field(default_factory=list)


class RefreshAnalyticsViewResponse(BaseModel):
    materialized_view: str
    rows: int
