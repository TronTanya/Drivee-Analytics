"""Алиас Quality Center под `/api/v1/quality/*` (pitch / manager UX)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import require_capability
from app.models.user import User
from app.schemas.evaluation_drivee_quality import QualityCenterOverview
from app.services.evaluation.quality_center_service import get_last_quality_center_overview, run_full_quality_center

router = APIRouter(prefix="/quality", tags=["quality"])


@router.get("/summary", response_model=QualityCenterOverview)
def quality_center_summary_v1(
    user: User = Depends(require_capability("view_quality_center")),
    mode: str = "deterministic",
) -> QualityCenterOverview:
    assert user.id
    last = get_last_quality_center_overview()
    if last is None:
        return run_full_quality_center(mode=mode)  # type: ignore[arg-type]
    return last
