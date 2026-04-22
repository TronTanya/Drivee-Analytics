from fastapi import APIRouter

from app.schemas.analytics import RunAnalyticsRequest, RunAnalyticsResponse
from app.services.analytics_pipeline import run_pipeline

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/run", response_model=RunAnalyticsResponse)
def run_analytics(payload: RunAnalyticsRequest) -> RunAnalyticsResponse:
    return run_pipeline(notebook_id=payload.notebook_id, prompt=payload.prompt)
