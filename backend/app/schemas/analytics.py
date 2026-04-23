from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.pipeline import PipelineCellItem
from app.schemas.trace_payload import AnalyticsExplainabilityTraceV1


class RunAnalyticsRequest(BaseModel):
    notebook_id: str
    prompt: str
    result_limit: Optional[int] = Field(None, ge=1, le=10_000, description="Пагинация таблицы результата (опционально).")
    result_offset: Optional[int] = Field(None, ge=0, description="Смещение для result_limit.")


class RunAnalyticsResponse(BaseModel):
    notebook_id: str
    cells: list[PipelineCellItem]
    trace: AnalyticsExplainabilityTraceV1
