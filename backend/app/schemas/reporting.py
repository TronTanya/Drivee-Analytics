"""Saved reports, schedules, templates, query history API schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

FrequencyLiteral = Literal["daily", "weekly", "monthly"]
DeliveryChannelLiteral = Literal["in_app", "email_mock"]


class ReportPayload(BaseModel):
    prompt: str = Field(..., min_length=1)
    notebook_context: dict[str, Any] = Field(default_factory=dict)
    role_key: Optional[str] = None
    interpreted_query: Optional[str] = Field(
        default=None,
        description="Человекочитаемая интерпретация / intent summary на момент сохранения.",
    )
    generated_sql: Optional[str] = Field(default=None, description="SQL на момент сохранения.")
    result_metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Метаданные результата: колонки, число строк, preview hash, validation и т.д.",
    )
    chart_type: Optional[str] = Field(default=None, description="Выбранный или рекомендованный тип графика.")
    chart_config: dict[str, Any] = Field(
        default_factory=dict,
        description="Параметры визуализации на момент сохранения (тип, серии, подписи — по мере наличия в UI).",
    )
    result_snapshot: dict[str, Any] = Field(
        default_factory=dict,
        description="Снимок таблицы: columns, rows (ограниченный список), row_count.",
    )
    creator_role_key: Optional[str] = Field(default=None, description="Роль пользователя, сохранившего отчёт.")
    creator_user_id: Optional[str] = Field(default=None, description="UUID автора на момент сохранения.")
    trace_summary: Optional[str] = None
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    warnings: list[str] = Field(default_factory=list)
    captured_at: Optional[str] = Field(
        default=None,
        description="ISO-8601: когда снят снимок аналитики (клиент или сервер).",
    )
    saved_at: Optional[str] = Field(
        default=None,
        description="ISO-8601: когда отчёт записан в каталог (обычно серверное now).",
    )


class SavedReportCreate(BaseModel):
    workspace_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=512)
    description: Optional[str] = None
    notebook_id: Optional[uuid.UUID] = None
    source_cell_id: Optional[uuid.UUID] = Field(
        default=None,
        description="If set, prompt/context are taken from this notebook cell (must be prompt type).",
    )
    payload: Optional[ReportPayload] = None


class ScheduleSettingsBase(BaseModel):
    frequency: FrequencyLiteral
    hour_utc: int = Field(9, ge=0, le=23)
    minute_utc: int = Field(0, ge=0, le=59)
    day_of_week: int = Field(0, ge=0, le=6, description="0=Monday .. 6=Sunday")
    day_of_month: int = Field(1, ge=1, le=28)
    delivery_channel: DeliveryChannelLiteral = "in_app"
    delivery_config_json: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class ScheduleCreate(ScheduleSettingsBase):
    pass


class SchedulePatch(BaseModel):
    frequency: Optional[FrequencyLiteral] = None
    hour_utc: Optional[int] = Field(default=None, ge=0, le=23)
    minute_utc: Optional[int] = Field(default=None, ge=0, le=59)
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    day_of_month: Optional[int] = Field(default=None, ge=1, le=28)
    delivery_channel: Optional[DeliveryChannelLiteral] = None
    delivery_config_json: Optional[dict[str, Any]] = None
    is_active: Optional[bool] = None


class ScheduleResponse(BaseModel):
    id: uuid.UUID
    report_id: uuid.UUID
    cron_expression: str
    timezone: str
    is_active: bool
    delivery_channel: str
    delivery_config_json: dict[str, Any]
    last_run_at: Optional[datetime]
    next_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    frequency: Optional[FrequencyLiteral] = None
    hour_utc: Optional[int] = None
    minute_utc: Optional[int] = None


class SavedReportListItem(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    title: str
    description: Optional[str]
    notebook_id: Optional[uuid.UUID]
    created_by: Optional[uuid.UUID]
    creator_role_key: Optional[str] = None
    is_shared: bool
    created_at: datetime
    updated_at: datetime
    has_schedule: bool = False
    report_format: str = "pdf"


class SavedReportDetail(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    title: str
    description: Optional[str]
    notebook_id: Optional[uuid.UUID]
    report_payload_json: dict[str, Any]
    created_by: Optional[uuid.UUID]
    is_shared: bool
    created_at: datetime
    updated_at: datetime
    schedule: Optional[ScheduleResponse] = None


class RunReportResponse(BaseModel):
    report_id: uuid.UUID
    execution_status: str
    safe_sql: str = ""
    insight: str = ""
    chart_type: str = "line"
    table_records: list[dict[str, Any]] = Field(default_factory=list)
    confidence: float = 0.0
    warnings: list[str] = Field(default_factory=list)
    trace_summary: str = ""
    clarification_required: bool = False


class QueryTemplateResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    workspace_id: uuid.UUID
    template_key: str
    template_name: str
    description: Optional[str]
    nl_prompt_template: str
    # Канонический SELECT к public.train для быстрого запуска и подстановки в сценарий.
    sql_template: Optional[str] = None
    default_chart_type: Optional[str]
    default_params_json: dict[str, Any]
    target_role_id: Optional[uuid.UUID]
    # Ключ роли-владельца (manager/marketer/executive); None если шаблон общий для всех.
    target_role_key: Optional[str] = None
    is_system: bool


class TemplateQuickRunResponse(BaseModel):
    template_id: uuid.UUID
    execution_status: str
    safe_sql: str = ""
    insight: str = ""
    chart_type: str = "line"
    table_records: list[dict[str, Any]] = Field(default_factory=list)
    confidence: float = 0.0
    warnings: list[str] = Field(default_factory=list)


class HistoryItemResponse(BaseModel):
    id: uuid.UUID
    notebook_id: uuid.UUID
    owner_user_id: Optional[uuid.UUID] = None
    original_query: str
    interpreted_intent: dict[str, Any]
    interpreted_summary: Optional[str] = None
    generated_sql_preview: str
    chart_type: Optional[str] = None
    table_row_count: Optional[int] = None
    validation_status: str
    execution_status: str
    confidence: Optional[float] = Field(default=None, description="Уверенность ячейки / pipeline.")
    result_summary: Optional[str] = Field(default=None, description="Краткий инсайт / summary результата.")
    author_role_key: Optional[str] = Field(default=None, description="Роль владельца ноутбука (автор запуска).")
    created_at: datetime
    rerun_notebook_id: uuid.UUID
    rerun_cell_id: uuid.UUID
    save_as_report_body_hint: dict[str, Any] = Field(default_factory=dict)
