"""API Golden NL→SQL Evaluation (метрики качества для жюри)."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from app.api.deps import get_current_active_user
from app.models.user import User
from app.schemas.evaluation_nl_sql import (
    EvaluationMode,
    EvaluationRunRequest,
    EvaluationRunResponse,
    EvaluationSummary,
    GoldenCasePublic,
)
from app.services.evaluation.nl_sql_evaluator import (
    get_last_evaluation_summary,
    load_golden_cases_public,
    run_nl_sql_evaluation,
)

router = APIRouter(prefix="/evaluation/nl-sql", tags=["evaluation"])


@router.get("/summary", response_model=EvaluationSummary)
def nl_sql_eval_summary(
    user: User = Depends(get_current_active_user),
    mode: EvaluationMode = "mock",
) -> EvaluationSummary:
    _ = user
    summary, _ = get_last_evaluation_summary()
    if summary is None:
        summary, _ = run_nl_sql_evaluation(mode=mode)
    return summary


@router.get("/cases", response_model=list[GoldenCasePublic])
def nl_sql_eval_cases(user: User = Depends(get_current_active_user)) -> list[GoldenCasePublic]:
    _ = user
    return load_golden_cases_public()


@router.post("/run", response_model=EvaluationRunResponse)
def nl_sql_eval_run(
    user: User = Depends(get_current_active_user),
    body: EvaluationRunRequest = Body(default_factory=EvaluationRunRequest),
) -> EvaluationRunResponse:
    _ = user
    mode = body.mode or "mock"
    summary, case_results = run_nl_sql_evaluation(mode=mode)
    return EvaluationRunResponse(summary=summary, case_results=case_results)
