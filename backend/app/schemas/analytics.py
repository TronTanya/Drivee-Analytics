from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.pipeline import PipelineCellItem
from app.schemas.trace_payload import AnalyticsExplainabilityTraceV1

ForecastSidecarOverride = Literal["auto", "on", "off"]


class RunAnalyticsRequest(BaseModel):
    notebook_id: str
    prompt: str
    result_limit: Optional[int] = Field(None, ge=1, le=10_000, description="Пагинация таблицы результата (опционально).")
    result_offset: Optional[int] = Field(None, ge=0, description="Смещение для result_limit.")
    force_fresh_dialogue: bool = Field(
        False,
        description="Игнорировать last_user_query / follow-up снимок для этого запуска.",
    )
    skip_learned_corrections: bool = Field(
        False,
        description="Не применять learned SQL-коррекции из workspace.",
    )
    forecast_sidecar: ForecastSidecarOverride = Field(
        "auto",
        description="on/off/auto — принудительно добавить/убрать числовой прогноз по ряду.",
    )
    chart_type_override: Optional[str] = Field(
        None,
        description="Зафиксировать тип графика в ответе (если задан).",
    )
    forecast_horizon_steps: Optional[int] = Field(
        None,
        ge=1,
        le=90,
        description="Число шагов baseline-прогноза (перекрывает эвристику из текста).",
    )


class RunAnalyticsResponse(BaseModel):
    notebook_id: str
    cells: list[PipelineCellItem]
    trace: AnalyticsExplainabilityTraceV1
    question: str
    interpreted_query: str
    safe_sql: str
    table: dict[str, Any]
    chart: dict[str, Any]
    insight: str
    confidence: float
    resolved_source_table: str = Field(
        default="",
        description="Поверхность данных после enrich контекста (например public.train); для UI и согласованности с отчётами.",
    )
