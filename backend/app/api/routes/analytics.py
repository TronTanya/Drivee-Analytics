from fastapi import APIRouter

from app.schemas.analytics import RunAnalyticsRequest, RunAnalyticsResponse
from app.services.analytics_pipeline import run_pipeline

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/run", response_model=RunAnalyticsResponse)
def run_analytics(payload: RunAnalyticsRequest) -> RunAnalyticsResponse:
    return run_pipeline(
        notebook_id=payload.notebook_id,
        prompt=payload.prompt,
        result_limit=payload.result_limit,
        result_offset=payload.result_offset,
        force_fresh_dialogue=payload.force_fresh_dialogue,
        skip_learned_corrections=payload.skip_learned_corrections,
        forecast_sidecar=payload.forecast_sidecar,
        chart_type_override=payload.chart_type_override,
    )
