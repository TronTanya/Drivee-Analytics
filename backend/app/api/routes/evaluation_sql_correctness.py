"""API: SQL Correctness Evaluation Suite."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends

from app.api.deps import get_current_active_user
from app.models.user import User
from app.schemas.evaluation_sql_correctness import (
    EvaluationMode,
    SqlCorrectnessCasePublic,
    SqlCorrectnessRunRequest,
    SqlCorrectnessRunResponse,
    SqlCorrectnessSummary,
)
from app.services.evaluation.sql_correctness_evaluator import (
    get_last_sql_correctness_summary,
    load_sql_correctness_cases_public,
    run_sql_correctness_evaluation,
)

router = APIRouter(prefix="/evaluation/sql-correctness", tags=["evaluation"])


@router.get("/summary", response_model=SqlCorrectnessSummary)
def sql_correctness_summary(
    user: User = Depends(get_current_active_user),
    mode: EvaluationMode = "mock",
) -> SqlCorrectnessSummary:
    _ = user
    summary, _ = get_last_sql_correctness_summary()
    if summary is None:
        summary, _ = run_sql_correctness_evaluation(mode=mode)
    return summary


@router.get("/cases", response_model=list[SqlCorrectnessCasePublic])
def sql_correctness_cases(user: User = Depends(get_current_active_user)) -> list[SqlCorrectnessCasePublic]:
    _ = user
    rows = load_sql_correctness_cases_public()
    return [SqlCorrectnessCasePublic(**r) for r in rows]


@router.post("/run", response_model=SqlCorrectnessRunResponse)
def sql_correctness_run(
    user: User = Depends(get_current_active_user),
    body: SqlCorrectnessRunRequest = Body(default_factory=SqlCorrectnessRunRequest),
) -> SqlCorrectnessRunResponse:
    _ = user
    mode = body.mode or "mock"
    summary, case_results = run_sql_correctness_evaluation(mode=mode)
    return SqlCorrectnessRunResponse(summary=summary, case_results=case_results)
