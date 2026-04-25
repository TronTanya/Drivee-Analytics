"""Сводка последнего прогона golden NL→SQL из `evals/results/latest_eval_results.json` для API / жюри."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from app.schemas.evaluation_golden_file_summary import (
    NlSqlGoldenEvalCaseRow,
    NlSqlGoldenEvalMetrics,
    NlSqlGoldenEvalSummaryResponse,
)

_BACKEND_ROOT = Path(__file__).resolve().parents[3]
_RESULTS_JSON = _BACKEND_ROOT / "evals" / "results" / "latest_eval_results.json"
_GOLDEN_CASES_JSON = _BACKEND_ROOT / "evals" / "nl_sql_golden_cases.json"


def _load_json(path: Path) -> Optional[dict[str, Any]]:
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return raw if isinstance(raw, dict) else None


def _prompt_index() -> dict[str, str]:
    data = _load_json(_GOLDEN_CASES_JSON)
    if not data:
        return {}
    cases = data.get("cases")
    if not isinstance(cases, list):
        return {}
    out: dict[str, str] = {}
    for c in cases:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("id") or "").strip()
        if not cid:
            continue
        out[cid] = str(c.get("prompt") or "").strip()
    return out


def _golden_case_by_id() -> dict[str, dict[str, Any]]:
    data = _load_json(_GOLDEN_CASES_JSON)
    if not data:
        return {}
    cases = data.get("cases")
    if not isinstance(cases, list):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for c in cases:
        if isinstance(c, dict) and c.get("id"):
            out[str(c["id"])] = c
    return out


def _expected_status_label(golden: dict[str, Any]) -> str:
    exp = golden.get("expected")
    if not isinstance(exp, dict):
        return "unknown"
    cat = str(golden.get("category") or "")
    if cat == "guardrail":
        if exp.get("should_execute") is False:
            return "blocked"
        return "execute_success"
    if bool(exp.get("requires_clarification")):
        return "clarification_required"
    if bool(exp.get("should_execute", True)):
        return "execute_success"
    return "no_execute"


def _guardrails_column(category: str, passed: bool) -> str:
    if category == "guardrail":
        return "pass" if passed else "fail"
    return "—"


def build_nl_sql_golden_eval_summary() -> NlSqlGoldenEvalSummaryResponse:
    empty_metrics = NlSqlGoldenEvalMetrics()
    if not _RESULTS_JSON.is_file():
        return NlSqlGoldenEvalSummaryResponse(
            total_cases=0,
            passed_cases=0,
            score=0.0,
            metrics=empty_metrics,
            cases=[],
            source="missing",
        )

    raw = _load_json(_RESULTS_JSON)
    if not raw:
        return NlSqlGoldenEvalSummaryResponse(
            total_cases=0,
            passed_cases=0,
            score=0.0,
            metrics=empty_metrics,
            cases=[],
            source=str(_RESULTS_JSON),
        )

    metrics_raw = raw.get("metrics")
    if not isinstance(metrics_raw, dict):
        metrics_raw = {}

    metrics = NlSqlGoldenEvalMetrics(
        nl_sql_accuracy=float(metrics_raw.get("nl_sql_accuracy") or 0.0),
        sql_safety=float(metrics_raw.get("sql_safety") or 0.0),
        chart_accuracy=float(metrics_raw.get("chart_accuracy") or 0.0),
        clarification_accuracy=float(metrics_raw.get("clarification_accuracy") or 0.0),
        trace_completeness=float(metrics_raw.get("trace_completeness") or 0.0),
    )

    prompts = _prompt_index()
    golden_by_id = _golden_case_by_id()

    cases_out: list[NlSqlGoldenEvalCaseRow] = []
    for c in raw.get("cases") or []:
        if not isinstance(c, dict):
            continue
        cid = str(c.get("id") or "")
        if not cid:
            continue
        question = str(c.get("prompt") or prompts.get(cid) or f"({cid})").strip()
        g = golden_by_id.get(cid) or {}
        expected_status = _expected_status_label(g) if g else "unknown"
        actual_status = str(c.get("status") or "unknown")
        chart = str(c.get("chart_type") or "")
        cat = str(c.get("category") or "")
        passed = bool(c.get("passed"))
        cases_out.append(
            NlSqlGoldenEvalCaseRow(
                id=cid,
                question=question,
                expected_status=expected_status,
                actual_status=actual_status,
                chart=chart,
                guardrails=_guardrails_column(cat, passed),
                passed=passed,
            )
        )

    return NlSqlGoldenEvalSummaryResponse(
        total_cases=int(raw.get("total") or 0),
        passed_cases=int(raw.get("passed") or 0),
        score=float(raw.get("score") or 0.0),
        metrics=metrics,
        cases=cases_out,
        generated_at=str(raw.get("generated_at") or "") or None,
        mode=str(raw.get("mode") or "") or None,
        source=str(_RESULTS_JSON),
    )
