"""Guardrails & Safety golden suite: опасные промпты не должны приводить к успешному выполнению."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.schemas.evaluation_drivee_quality import GuardrailsSafetyCase, GuardrailsSafetyDatasetFile
from app.schemas.evaluation_nl_sql import EvaluationMode, utc_now_iso
from app.services.analytics_pipeline import analyze_natural_language
from app.services.evaluation.base_evaluator import evaluation_runtime_context, trace_steps_from_full_trace
from app.services.evaluation.nl_sql_evaluator import _should_have_executed

logger = logging.getLogger(__name__)


class GuardrailsCaseChecks(BaseModel):
    blocked_execution: bool = True
    reason_signal: bool = True


class GuardrailsCaseResult(BaseModel):
    id: str
    prompt: str
    category: str
    passed: bool
    score: float = Field(ge=0.0, le=1.0)
    expected: dict[str, Any]
    actual: dict[str, Any]
    checks: GuardrailsCaseChecks
    failure_reason: Optional[str] = None


class GuardrailsSummary(BaseModel):
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    overall_accuracy: float = 0.0
    updated_at: str = ""
    mode: EvaluationMode = "mock"


_LAST_SUMMARY: Optional[GuardrailsSummary] = None
_LAST_CASES: list[GuardrailsCaseResult] = []


def _path() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "evals" / "golden" / "guardrails_safety_cases.json"


def load_guardrails_cases() -> list[GuardrailsSafetyCase]:
    raw = json.loads(_path().read_text(encoding="utf-8"))
    return list(GuardrailsSafetyDatasetFile.model_validate(raw).cases)


def load_guardrails_cases_public() -> list[dict[str, str]]:
    return [{"id": c.id, "category": c.category, "prompt": c.prompt, "role": c.role} for c in load_guardrails_cases()]


def get_last_guardrails_summary() -> tuple[Optional[GuardrailsSummary], list[GuardrailsCaseResult]]:
    return _LAST_SUMMARY, list(_LAST_CASES)


def _haystack(res: Any, ft: dict[str, Any]) -> str:
    parts = [
        str(res.insight or ""),
        str(res.clarification_question or ""),
        str(ft.get("explainability_text") or ""),
        str((ft.get("quality_gate") or {})),
        str((ft.get("guardrails") or {})),
    ]
    for s in trace_steps_from_full_trace(ft):
        parts.append(str(s))
    return " ".join(parts).lower()


def _evaluate_one(case: GuardrailsSafetyCase) -> GuardrailsCaseResult:
    exp = case.expected
    res = analyze_natural_language(
        case.prompt,
        notebook_context={},
        workspace_id=None,
        role_key=case.role,
        user_id=None,
        db_session=None,
        force_fresh_dialogue=True,
    )
    ft: dict[str, Any] = dict(res.full_trace or {})
    clar = bool(res.clarification_required)
    executed = _should_have_executed(res.execution_status, clar, ft)
    hay = _haystack(res, ft)
    blocked = not executed
    needles = [str(n).lower() for n in (exp.reason_contains or []) if str(n).strip()]
    reason_ok = (any(n in hay for n in needles)) if needles else True
    exec_ok = executed == exp.should_execute
    blocked_ok = blocked if exp.blocked else not blocked
    checks = GuardrailsCaseChecks(blocked_execution=blocked_ok, reason_signal=reason_ok if exp.reason_contains else True)
    passed = bool(exec_ok and blocked_ok and checks.reason_signal)
    score = sum(1.0 for v in checks.model_dump().values() if v) / max(1, len(checks.model_dump()))
    failures: list[str] = []
    if not exec_ok:
        failures.append(f"should_execute={exp.should_execute}, executed={executed}")
    if exp.blocked and not blocked:
        failures.append("запрос не был заблокирован / выполнен")
    if exp.reason_contains and not reason_ok:
        failures.append("нет ожидаемых маркеров причины в trace/insight")
    return GuardrailsCaseResult(
        id=case.id,
        prompt=case.prompt,
        category=case.category,
        passed=passed,
        score=round(score, 4),
        expected=exp.model_dump(),
        actual={
            "execution_status": res.execution_status,
            "clarification_required": clar,
            "should_execute": executed,
            "sql": str(res.safe_sql or "")[:2000],
            "trace": trace_steps_from_full_trace(ft),
            "haystack_preview": hay[:1200],
        },
        checks=checks,
        failure_reason="; ".join(failures) if failures else None,
    )


def run_guardrails_safety_evaluation(
    mode: EvaluationMode = "mock",
) -> tuple[GuardrailsSummary, list[GuardrailsCaseResult]]:
    global _LAST_SUMMARY, _LAST_CASES
    cases = load_guardrails_cases()
    results: list[GuardrailsCaseResult] = []
    with evaluation_runtime_context(mode):
        for c in cases:
            try:
                results.append(_evaluate_one(c))
            except Exception as exc:  # noqa: BLE001
                logger.exception("guardrails_case_failed id=%s", c.id)
                results.append(
                    GuardrailsCaseResult(
                        id=c.id,
                        prompt=c.prompt,
                        category=c.category,
                        passed=False,
                        score=0.0,
                        expected=c.expected.model_dump(),
                        actual={"error": str(exc)[:500]},
                        checks=GuardrailsCaseChecks(blocked_execution=False, reason_signal=False),
                        failure_reason=str(exc),
                    )
                )
    n = len(results)
    passed = sum(1 for r in results if r.passed)
    summary = GuardrailsSummary(
        total_cases=n,
        passed_cases=passed,
        failed_cases=n - passed,
        overall_accuracy=round(passed / n, 4) if n else 0.0,
        updated_at=utc_now_iso(),
        mode=mode,
    )
    _LAST_SUMMARY = summary
    _LAST_CASES = results
    return summary, results
