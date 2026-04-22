from pydantic import BaseModel

from app.schemas.pipeline import PipelineCellItem
from app.schemas.trace_payload import AnalyticsExplainabilityTraceV1


class RunAnalyticsRequest(BaseModel):
    notebook_id: str
    prompt: str


class RunAnalyticsResponse(BaseModel):
    notebook_id: str
    cells: list[PipelineCellItem]
    trace: AnalyticsExplainabilityTraceV1
