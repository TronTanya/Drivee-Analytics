from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends

from app.api.deps import get_current_active_user, get_notebook_service, require_capability
from app.models.user import User
from app.schemas.analytics import RunAnalyticsRequest, RunAnalyticsResponse
from app.services.analytics_pipeline import MOCK_NOTEBOOK_CELLS, run_pipeline_with_analysis
from app.services.notebook_service import NotebookService

router = APIRouter(prefix="/analytics", tags=["analytics"])
logger = logging.getLogger(__name__)


@router.post("/run", response_model=RunAnalyticsResponse)
def run_analytics(
    payload: RunAnalyticsRequest,
    user: User = Depends(require_capability("run_query")),
    service: NotebookService = Depends(get_notebook_service),
) -> RunAnalyticsResponse:
    rk = user.role.role_key if user.role else None
    resp, analysis = run_pipeline_with_analysis(
        payload.notebook_id,
        payload.prompt,
        role_key=rk,
        result_limit=payload.result_limit,
        result_offset=payload.result_offset,
        force_fresh_dialogue=payload.force_fresh_dialogue,
        skip_learned_corrections=payload.skip_learned_corrections,
        forecast_sidecar=payload.forecast_sidecar,
        chart_type_override=payload.chart_type_override,
        forecast_horizon_steps=payload.forecast_horizon_steps,
    )
    prev = MOCK_NOTEBOOK_CELLS.get(payload.notebook_id, [])
    MOCK_NOTEBOOK_CELLS[payload.notebook_id] = prev + list(resp.cells)

    try:
        nb_uuid = uuid.UUID(payload.notebook_id)
    except ValueError:
        return resp
    try:
        service.append_pipeline_run_from_analysis(user, nb_uuid, payload.prompt, analysis)
    except Exception:
        logger.exception("persist_analytics_pipeline_failed notebook_id=%s", payload.notebook_id)
    return resp
