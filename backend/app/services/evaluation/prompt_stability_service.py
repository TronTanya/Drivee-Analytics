"""N-кратный прогон одного промпта для оценки стабильности outcome (deterministic/mock/live)."""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.schemas.evaluation_drivee_quality import PromptStabilityRequest, PromptStabilityResponse, PromptStabilityRow
from app.schemas.evaluation_nl_sql import EvaluationMode
from app.services.analytics_pipeline import analyze_natural_language
from app.services.evaluation.base_evaluator import evaluation_runtime_context
from app.services.evaluation.nl_sql_evaluator import _should_have_executed


def _outcome_label(*, clar: bool, executed: bool, status: str, sql: str) -> str:
    if clar:
        return "clarification"
    if not executed and status in ("failed", "blocked", "clarification_required"):
        if "guard" in status.lower():
            return "blocked"
        return "no_execution"
    if status == "succeeded" and sql.strip():
        return "sql_ok"
    return status or "unknown"


def run_prompt_stability(req: PromptStabilityRequest) -> PromptStabilityResponse:
    mode: EvaluationMode = req.mode
    rows: list[PromptStabilityRow] = []
    outcomes: Counter[str] = Counter()
    with evaluation_runtime_context(mode):
        for i in range(req.runs):
            res = analyze_natural_language(
                req.prompt,
                notebook_context={},
                workspace_id=None,
                role_key="manager",
                user_id=None,
                db_session=None,
                force_fresh_dialogue=True,
            )
            ft: dict[str, Any] = dict(res.full_trace or {})
            clar = bool(res.clarification_required)
            executed = _should_have_executed(res.execution_status, clar, ft)
            g = ft.get("guardrails") if isinstance(ft.get("guardrails"), dict) else {}
            blocked = bool(g.get("blocked")) if g else False
            sql = str(res.safe_sql or "")
            label = _outcome_label(clar=clar, executed=executed, status=str(res.execution_status), sql=sql)
            if blocked:
                label = "blocked"
            outcomes[label] += 1
            rows.append(
                PromptStabilityRow(
                    run_index=i + 1,
                    outcome=label,
                    clarification_required=clar,
                    execution_status=str(res.execution_status),
                    sql_preview=sql[:240],
                    blocked=blocked,
                )
            )
    dominant = outcomes.most_common(1)[0][1] if outcomes else 0
    stability = round(dominant / max(1, req.runs), 4)
    return PromptStabilityResponse(
        prompt=req.prompt,
        runs=req.runs,
        stability_score=stability,
        outcomes=dict(outcomes),
        results=rows,
    )
