"""Golden Visualization Match: chart_type и эвристика result_shape (без отдельного SQL IDE)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.schemas.evaluation_drivee_quality import VisualizationCase, VisualizationDatasetFile
from app.schemas.evaluation_nl_sql import EvaluationMode, utc_now_iso
from app.services.analytics_pipeline import analyze_natural_language
from app.services.evaluation.base_evaluator import evaluation_runtime_context, trace_steps_from_full_trace

logger = logging.getLogger(__name__)


class VisualizationCaseChecks(BaseModel):
    chart_type: bool = True
    result_shape: bool = True


class VisualizationCaseResult(BaseModel):
    id: str
    prompt: str
    category: str = "visualization"
    passed: bool
    score: float = Field(ge=0.0, le=1.0)
    expected: dict[str, Any]
    actual: dict[str, Any]
    checks: VisualizationCaseChecks
    failure_reason: Optional[str] = None


class VisualizationSummary(BaseModel):
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    overall_accuracy: float = 0.0
    chart_match_rate: float = 0.0
    updated_at: str = ""
    mode: EvaluationMode = "mock"


_LAST_SUMMARY: Optional[VisualizationSummary] = None
_LAST_CASES: list[VisualizationCaseResult] = []


def _path() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "evals" / "golden" / "visualization_match_cases.json"


def load_visualization_cases() -> list[VisualizationCase]:
    raw = json.loads(_path().read_text(encoding="utf-8"))
    return list(VisualizationDatasetFile.model_validate(raw).cases)


def load_visualization_cases_public() -> list[dict[str, str]]:
    return [{"id": c.id, "prompt": c.prompt, "role": c.role} for c in load_visualization_cases()]


def get_last_visualization_summary() -> tuple[Optional[VisualizationSummary], list[VisualizationCaseResult]]:
    return _LAST_SUMMARY, list(_LAST_CASES)


def _check_chart(exp: Optional[str], act: str) -> bool:
    if not exp:
        return True
    e = str(exp).strip().lower()
    a = (act or "").strip().lower()
    if e == a:
        return True
    if e == "pie" and a == "donut":
        return True
    if e == "bar" and a in ("bar", "horizontal_bar"):
        return True
    if e == "map" and a in ("map", "geo", "choropleth"):
        return True
    return False


def _shape_ok(expected: list[str], sql: str) -> bool:
    if not expected:
        return True
    u = (sql or "").lower()
    return all(tok.lower() in u for tok in expected if tok)


def _evaluate_one(case: VisualizationCase) -> VisualizationCaseResult:
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
    chart = str(res.chart_type or "").strip() or "table"
    sql = str(res.safe_sql or "")
    c_ok = _check_chart(exp.chart_type, chart)
    s_ok = _shape_ok(list(exp.result_shape or []), sql)
    checks = VisualizationCaseChecks(chart_type=c_ok, result_shape=s_ok)
    passed = bool(c_ok and s_ok)
    score = sum(1.0 for v in checks.model_dump().values() if v) / max(1, len(checks.model_dump()))
    failures: list[str] = []
    if not c_ok and exp.chart_type:
        failures.append(f"chart: ожидали {exp.chart_type}, получили {chart}")
    if not s_ok and exp.result_shape:
        failures.append(f"result_shape: ожидали {exp.result_shape} в SQL")
    return VisualizationCaseResult(
        id=case.id,
        prompt=case.prompt,
        passed=passed,
        score=round(score, 4),
        expected=exp.model_dump(),
        actual={
            "chart_type": chart,
            "sql": sql[:4000],
            "trace": trace_steps_from_full_trace(ft),
            "execution_status": res.execution_status,
        },
        checks=checks,
        failure_reason="; ".join(failures) if failures else None,
    )


def _mean(vals: list[bool]) -> float:
    if not vals:
        return 0.0
    return round(sum(1 for v in vals if v) / len(vals), 4)


def run_visualization_match_evaluation(
    mode: EvaluationMode = "mock",
) -> tuple[VisualizationSummary, list[VisualizationCaseResult]]:
    global _LAST_SUMMARY, _LAST_CASES
    cases = load_visualization_cases()
    results: list[VisualizationCaseResult] = []
    with evaluation_runtime_context(mode):
        for c in cases:
            try:
                results.append(_evaluate_one(c))
            except Exception as exc:  # noqa: BLE001
                logger.exception("viz_case_failed id=%s", c.id)
                results.append(
                    VisualizationCaseResult(
                        id=c.id,
                        prompt=c.prompt,
                        passed=False,
                        score=0.0,
                        expected=c.expected.model_dump(),
                        actual={"error": str(exc)[:500]},
                        checks=VisualizationCaseChecks(chart_type=False, result_shape=False),
                        failure_reason=str(exc),
                    )
                )
    n = len(results)
    passed = sum(1 for r in results if r.passed)
    summary = VisualizationSummary(
        total_cases=n,
        passed_cases=passed,
        failed_cases=n - passed,
        overall_accuracy=round(passed / n, 4) if n else 0.0,
        chart_match_rate=_mean([r.checks.chart_type for r in results]),
        updated_at=utc_now_iso(),
        mode=mode,
    )
    _LAST_SUMMARY = summary
    _LAST_CASES = results
    return summary, results
