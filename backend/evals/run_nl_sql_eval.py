#!/usr/bin/env python3
"""Локальный прогон golden NL→SQL через тот же orchestrator, что и API eval (без изменений production-кода)."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# backend/ как корень пакета app (работает из Docker WORKDIR=/app и при `python backend/evals/...` с cwd=репозиторий)
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))

from app.schemas.evaluation_nl_sql import CaseEvaluationResult, EvaluationMode  # noqa: E402
from app.services.evaluation.nl_sql_evaluator import run_nl_sql_evaluation  # noqa: E402


def _trace_step_names(trace: Any) -> set[str]:
    if not isinstance(trace, list):
        return set()
    out: set[str] = set()
    for item in trace:
        if isinstance(item, dict) and item.get("step"):
            out.add(str(item["step"]))
    return out


def _trace_completeness(case: CaseEvaluationResult, trace_names: set[str]) -> float:
    """Доля обязательных для сценария шагов pipeline в trace (имена как в QueryOrchestrator)."""
    exp = case.expected
    cat = case.category
    should_exec = bool(exp.get("should_execute"))
    need_clar = bool(exp.get("requires_clarification"))

    if cat == "guardrail" and not should_exec:
        need = ["classify_intent", "guardrails_policy"]
    elif cat == "clarification" or need_clar:
        need = ["classify_intent", "clarification_engine", "awaiting_user_clarification"]
    elif should_exec:
        need = ["classify_intent", "generate_sql", "validate_sql", "recommend_chart_type"]
    else:
        need = ["classify_intent", "semantic_parse"]

    met = sum(1 for s in need if s in trace_names)
    return round(met / max(1, len(need)), 4)


def _nl_sql_accuracy_row(checks: Any) -> float:
    parts = [checks.intent, checks.metric, checks.dimensions, checks.time_range]
    return round(sum(1.0 for p in parts if p) / max(1, len(parts)), 4)


def _derive_status(r: CaseEvaluationResult) -> str:
    """Статус прогона кейса: при несовпадении ожиданий — failed, даже если SQL выполнился."""
    act = r.actual
    if act.get("error"):
        return "error"
    if not r.passed:
        if act.get("requires_clarification"):
            return "clarification_mismatch"
        if r.category == "guardrail" and act.get("should_execute"):
            return "guardrail_leak"
        return "failed"
    if act.get("requires_clarification"):
        return "clarification_required"
    if r.category == "guardrail" and not act.get("should_execute"):
        return "blocked"
    es = str(act.get("execution_status") or "")
    if es == "succeeded":
        return "success"
    if es == "clarification_required":
        return "clarification_required"
    return "failed"


def _errors_list(r: CaseEvaluationResult) -> list[str]:
    if not r.failure_reason:
        return []
    return [s.strip() for s in str(r.failure_reason).split(";") if s.strip()]


def _build_report(
    summary: Any,
    results: list[CaseEvaluationResult],
    *,
    mode: str,
) -> dict[str, Any]:
    n = len(results)
    passed_n = sum(1 for r in results if r.passed)
    failed_n = n - passed_n
    overall = round(passed_n / n, 4) if n else 0.0

    nl_rows = [_nl_sql_accuracy_row(r.checks) for r in results]
    nl_sql_accuracy = round(sum(nl_rows) / max(1, len(nl_rows)), 4)

    sql_safety = round(
        sum(1.0 for r in results if r.checks.sql_safety) / max(1, n),
        4,
    )
    chart_accuracy = round(
        sum(1.0 for r in results if r.checks.chart_type) / max(1, n),
        4,
    )

    clar_cases = [r for r in results if r.category == "clarification"]
    if clar_cases:
        clarification_accuracy = round(
            sum(1.0 for r in clar_cases if r.checks.clarification) / len(clar_cases),
            4,
        )
    else:
        clarification_accuracy = round(
            sum(1.0 for r in results if r.checks.clarification) / max(1, n),
            4,
        )

    trace_scores: list[float] = []
    cases_out: list[dict[str, Any]] = []
    for r in results:
        trace = r.actual.get("trace") or []
        tnames = _trace_step_names(trace)
        tc = _trace_completeness(r, tnames)
        trace_scores.append(tc)
        cases_out.append(
            {
                "id": r.id,
                "prompt": r.prompt,
                "category": r.category,
                "passed": r.passed,
                "status": _derive_status(r),
                "intent": r.actual.get("intent"),
                "metric": r.actual.get("metric"),
                "dimensions": r.actual.get("dimensions"),
                "chart_type": r.actual.get("chart_type"),
                "execution_status": r.actual.get("execution_status"),
                "requires_clarification": r.actual.get("requires_clarification"),
                "should_execute": r.actual.get("should_execute"),
                "score": r.score,
                "trace_completeness": tc,
                "trace_steps": sorted(tnames),
                "errors": _errors_list(r),
            }
        )

    trace_completeness = round(sum(trace_scores) / max(1, len(trace_scores)), 4)

    return {
        "total": n,
        "passed": passed_n,
        "failed": failed_n,
        "score": overall,
        "mode": mode,
        "deterministic_eval": mode == "deterministic",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "metrics": {
            "nl_sql_accuracy": nl_sql_accuracy,
            "sql_safety": sql_safety,
            "chart_accuracy": chart_accuracy,
            "clarification_accuracy": clarification_accuracy,
            "trace_completeness": trace_completeness,
            "guardrail_accuracy": float(summary.guardrail_accuracy),
            "intent_accuracy": float(summary.intent_accuracy),
            "metric_accuracy": float(summary.metric_accuracy),
            "dimension_accuracy": float(summary.dimension_accuracy),
            "time_range_accuracy": float(summary.time_range_accuracy),
            "sql_validation_pass_rate": float(summary.sql_validation_pass_rate),
        },
        "summary_reference": {
            "overall_accuracy": float(summary.overall_accuracy),
            "confidence_average": float(summary.confidence_average),
            "updated_at": summary.updated_at,
        },
        "cases": cases_out,
    }


def main() -> int:
    p = argparse.ArgumentParser(description="Golden NL→SQL eval → JSON (orchestrator через run_nl_sql_evaluation).")
    p.add_argument(
        "--mode",
        default="mock",
        choices=["mock", "deterministic", "live"],
        help="mock/deterministic: как в pytest eval (без внешнего LLM по умолчанию).",
    )
    p.add_argument(
        "--output",
        default="",
        help="Путь к JSON (по умолчанию evals/results/latest_eval_results.json относительно backend/).",
    )
    p.add_argument("--fail-under", type=float, default=None, help="Код выхода 1, если score ниже порога.")
    args = p.parse_args()

    mode: EvaluationMode = args.mode  # type: ignore[assignment]
    out_path = Path(args.output) if args.output else _BACKEND_ROOT / "evals" / "results" / "latest_eval_results.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    summary, results = run_nl_sql_evaluation(mode=mode)
    report = _build_report(summary, results, mode=args.mode)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"written": str(out_path), "score": report["score"], "passed": report["passed"], "total": report["total"]}, ensure_ascii=False))

    if args.fail_under is not None and float(report["score"]) < float(args.fail_under):
        print(f"FAIL: score {report['score']} < {args.fail_under}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
