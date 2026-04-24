"""Drivee Quality Center — aggregate + per-suite evaluation API."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends

from app.api.deps import get_current_active_user
from app.models.user import User
from app.schemas.evaluation_drivee_quality import (
    PromptStabilityRequest,
    PromptStabilityResponse,
    QualityCenterOverview,
    QualityCenterRunRequest,
    RepairBriefLatestResponse,
)
from app.schemas.evaluation_nl_sql import EvaluationRunResponse, EvaluationSummary
from app.services.evaluation.guardrails_safety_evaluator import (
    GuardrailsSummary,
    get_last_guardrails_summary,
    load_guardrails_cases_public,
    run_guardrails_safety_evaluation,
)
from app.services.evaluation.nl_sql_understanding_evaluator import (
    get_last_understanding_summary,
    load_understanding_cases_public,
    run_nl_sql_understanding_evaluation,
)
from app.services.evaluation.prompt_stability_service import run_prompt_stability
from app.services.evaluation.quality_center_service import (
    build_quality_last_run_bundle,
    get_last_quality_center_overview,
    run_full_quality_center,
)
from app.services.evaluation.repair_brief_service import get_latest_repair_brief, write_quality_run_bundle
from app.services.evaluation.sql_correctness_evaluator import (
    get_last_sql_correctness_summary,
    load_sql_correctness_cases_public,
    run_sql_correctness_evaluation,
)
from app.services.evaluation.visualization_match_evaluator import (
    VisualizationSummary,
    get_last_visualization_summary,
    load_visualization_cases_public,
    run_visualization_match_evaluation,
)

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


@router.get("/quality/summary", response_model=QualityCenterOverview)
def quality_center_summary(
    user: User = Depends(get_current_active_user),
    mode: str = "deterministic",
) -> QualityCenterOverview:
    _ = user
    last = get_last_quality_center_overview()
    if last is None:
        return run_full_quality_center(mode=mode)  # type: ignore[arg-type]
    return last


@router.get("/quality/last-run-details")
def quality_last_run_details(
    user: User = Depends(get_current_active_user),
    mode: str = "deterministic",
) -> dict[str, Any]:
    _ = user
    return build_quality_last_run_bundle(mode=mode)  # type: ignore[arg-type]


@router.get("/quality/repair-brief/latest", response_model=RepairBriefLatestResponse)
def quality_repair_brief_latest(user: User = Depends(get_current_active_user)) -> RepairBriefLatestResponse:
    _ = user
    raw = get_latest_repair_brief()
    if not raw:
        return RepairBriefLatestResponse(found=False)
    return RepairBriefLatestResponse(
        found=True,
        run_id=str(raw.get("run_id") or ""),
        overall_quality_score=raw.get("overall_quality_score"),
        repair_brief_md=str(raw.get("repair_brief_md") or ""),
    )


@router.post("/quality/run", response_model=QualityCenterOverview)
def quality_center_run(
    user: User = Depends(get_current_active_user),
    body: QualityCenterRunRequest = Body(default_factory=QualityCenterRunRequest),
) -> QualityCenterOverview:
    _ = user
    overview = run_full_quality_center(mode=body.mode)
    _, u_res = get_last_understanding_summary()
    _, s_res = get_last_sql_correctness_summary()
    _, v_res = get_last_visualization_summary()
    _, g_res = get_last_guardrails_summary()
    all_results: dict[str, list[dict[str, Any]]] = {
        "understanding": [r.model_dump(mode="json") for r in u_res],
        "sql_correctness": [r.model_dump(mode="json") for r in s_res],
        "visualization": [r.model_dump(mode="json") for r in v_res],
        "guardrails": [r.model_dump(mode="json") for r in g_res],
    }
    failing_simple: list[dict[str, Any]] = []
    for suite, rows in all_results.items():
        for row in rows:
            if not row.get("passed", True):
                failing_simple.append(
                    {
                        "suite": suite,
                        "id": row.get("id"),
                        "prompt": row.get("prompt", ""),
                        "failure_reason": row.get("failure_reason"),
                    }
                )
    write_quality_run_bundle(
        overview=overview.model_dump(mode="json"),
        failing_cases=failing_simple,
        all_case_results=all_results,
    )
    return overview


@router.get("/understanding/summary", response_model=EvaluationSummary)
def understanding_summary(
    user: User = Depends(get_current_active_user),
    mode: str = "deterministic",
) -> EvaluationSummary:
    _ = user
    s, _ = get_last_understanding_summary()
    if s is None:
        s, _ = run_nl_sql_understanding_evaluation(mode=mode)  # type: ignore[arg-type]
    return s


@router.get("/understanding/cases")
def understanding_cases(user: User = Depends(get_current_active_user)) -> list[dict[str, str]]:
    _ = user
    return load_understanding_cases_public()


@router.post("/understanding/run", response_model=EvaluationRunResponse)
def understanding_run(
    user: User = Depends(get_current_active_user),
    body: dict = Body(default_factory=dict),
) -> EvaluationRunResponse:
    _ = user
    mode = body.get("mode") or "deterministic"
    summary, case_results = run_nl_sql_understanding_evaluation(mode=mode)  # type: ignore[arg-type]
    return EvaluationRunResponse(summary=summary, case_results=case_results)


@router.get("/visualization/summary", response_model=VisualizationSummary)
def visualization_summary(
    user: User = Depends(get_current_active_user),
    mode: str = "deterministic",
) -> VisualizationSummary:
    _ = user
    s, _ = get_last_visualization_summary()
    if s is None:
        s, _ = run_visualization_match_evaluation(mode=mode)  # type: ignore[arg-type]
    return s


@router.get("/visualization/cases")
def visualization_cases(user: User = Depends(get_current_active_user)) -> list[dict[str, str]]:
    _ = user
    return load_visualization_cases_public()


@router.post("/visualization/run")
def visualization_run(
    user: User = Depends(get_current_active_user),
    body: dict = Body(default_factory=dict),
) -> dict[str, Any]:
    _ = user
    mode = body.get("mode") or "deterministic"
    summary, case_results = run_visualization_match_evaluation(mode=mode)  # type: ignore[arg-type]
    return {"summary": summary.model_dump(), "case_results": [c.model_dump() for c in case_results]}


@router.get("/guardrails/summary", response_model=GuardrailsSummary)
def guardrails_summary(
    user: User = Depends(get_current_active_user),
    mode: str = "deterministic",
) -> GuardrailsSummary:
    _ = user
    s, _ = get_last_guardrails_summary()
    if s is None:
        s, _ = run_guardrails_safety_evaluation(mode=mode)  # type: ignore[arg-type]
    return s


@router.get("/guardrails/cases")
def guardrails_cases(user: User = Depends(get_current_active_user)) -> list[dict[str, str]]:
    _ = user
    return load_guardrails_cases_public()


@router.post("/guardrails/run")
def guardrails_run(
    user: User = Depends(get_current_active_user),
    body: dict = Body(default_factory=dict),
) -> dict[str, Any]:
    _ = user
    mode = body.get("mode") or "deterministic"
    summary, case_results = run_guardrails_safety_evaluation(mode=mode)  # type: ignore[arg-type]
    return {"summary": summary.model_dump(), "case_results": [c.model_dump() for c in case_results]}


@router.post("/prompt-stability", response_model=PromptStabilityResponse)
def prompt_stability(
    user: User = Depends(get_current_active_user),
    body: PromptStabilityRequest = Body(...),
) -> PromptStabilityResponse:
    _ = user
    return run_prompt_stability(body)
