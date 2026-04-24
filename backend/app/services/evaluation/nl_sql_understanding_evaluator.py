"""Golden NL→SQL Understanding suite (отдельный датасет + confidence/limit/follow-up context)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from app.schemas.evaluation_drivee_quality import UnderstandingCase, UnderstandingDatasetFile
from app.schemas.evaluation_nl_sql import (
    CaseChecks,
    CaseEvaluationResult,
    EvaluationMode,
    EvaluationSummary,
    utc_now_iso,
)
from app.services.analytics_pipeline import analyze_natural_language
from app.services.evaluation.base_evaluator import evaluation_runtime_context, trace_steps_from_full_trace
from app.services.evaluation.nl_sql_evaluator import (
    _dimensions_from_trace,
    _filters_from_entities,
    _interpretation_block,
    _metric_from_result,
    _should_have_executed,
    _sql_checks,
    _sql_validation_ok,
    _time_range_token,
    _trace_steps_for_ui,
)

logger = logging.getLogger(__name__)

_LAST_SUMMARY: Optional[EvaluationSummary] = None
_LAST_CASES: list[CaseEvaluationResult] = []


def _dataset_path() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "evals" / "golden" / "nl_sql_understanding_cases.json"


def load_understanding_cases() -> list[UnderstandingCase]:
    raw = json.loads(_dataset_path().read_text(encoding="utf-8"))
    return list(UnderstandingDatasetFile.model_validate(raw).cases)


def load_understanding_cases_public() -> list[dict[str, str]]:
    return [{"id": c.id, "category": c.category, "prompt": c.prompt, "role": c.role} for c in load_understanding_cases()]


def get_last_understanding_summary() -> tuple[Optional[EvaluationSummary], list[CaseEvaluationResult]]:
    return _LAST_SUMMARY, list(_LAST_CASES)


def _notebook_context(case: UnderstandingCase) -> dict[str, Any]:
    ctx = case.context or {}
    if case.category != "follow_up":
        return {}
    prev = str(ctx.get("previous_prompt") or "").strip()
    interp = ctx.get("previous_interpretation") if isinstance(ctx.get("previous_interpretation"), dict) else {}
    nb: dict[str, Any] = {
        "last_user_query": prev,
        "last_rewritten_query": prev,
        "dialogue_turn": int(ctx.get("dialogue_turn") or 1),
    }
    if interp.get("metric"):
        nb["base_metric"] = interp.get("metric")
    if interp.get("intent"):
        nb["last_intent_kind"] = interp.get("intent")
    if isinstance(interp.get("active_filters"), dict):
        nb["active_filters"] = dict(interp["active_filters"])
    return nb


def _limit_ok(sql_text: str, entities: dict[str, Any], expected_limit: Optional[int]) -> bool:
    if expected_limit is None:
        return True
    if int(entities.get("top_n") or 0) == int(expected_limit):
        return True
    u = (sql_text or "").upper()
    return f"LIMIT {int(expected_limit)}" in u


def _evaluate_one(case: UnderstandingCase) -> CaseEvaluationResult:
    exp = case.expected
    nb = _notebook_context(case)
    force_fresh = case.category != "follow_up"

    res = analyze_natural_language(
        case.prompt,
        notebook_context=nb,
        workspace_id=None,
        role_key=case.role,
        user_id=None,
        db_session=None,
        force_fresh_dialogue=force_fresh,
    )
    ft: dict[str, Any] = dict(res.full_trace or {})
    intent = str(res.parsed.get("intent") or ft.get("intent") or "")
    metric = _metric_from_result(dict(res.parsed), ft)
    dims = _dimensions_from_trace(ft)
    entities = ft.get("entities")
    ent_d = entities if isinstance(entities, dict) else {}
    tr_token = _time_range_token(ent_d)
    chart = str(res.chart_type or "").strip() or "table"
    conf = float(res.confidence or 0.0)
    clar = bool(res.clarification_required)
    sql_text = str(res.safe_sql or "")
    executed = _should_have_executed(res.execution_status, clar, ft)
    sql_val = _sql_validation_ok(ft)

    def _chk_str(expected: Optional[str], actual: str) -> bool:
        if expected is None or expected == "":
            return True
        return (actual or "").strip().lower() == str(expected).strip().lower()

    def _chk_dims(expected: list[str], actual: list[str]) -> bool:
        if not expected:
            return True
        exp = {str(x).strip().lower() for x in expected if x}
        act = {str(x).strip().lower() for x in actual if x}
        return exp == act

    time_ok = True
    if exp.time_range not in (None, "", "unknown"):
        time_ok = _chk_str(exp.time_range, tr_token)
    chart_ok = True
    if exp.chart_type not in (None, ""):
        chart_ok = _chk_str(exp.chart_type, chart)

    conf_ok = True
    if exp.confidence_min is not None and not clar:
        conf_ok = conf >= float(exp.confidence_min)

    limit_ok = _limit_ok(sql_text, ent_d, exp.limit)

    checks = CaseChecks(
        intent=_chk_str(exp.intent, intent),
        metric=_chk_str(exp.metric, metric),
        dimensions=_chk_dims(list(exp.dimensions or []), dims),
        time_range=time_ok,
        chart_type=chart_ok,
        clarification=(clar == exp.requires_clarification),
        guardrail=(executed == exp.should_execute),
        sql_contains=True,
        sql_safety=True,
    )
    if case.category == "clarification":
        checks.intent = True
        checks.metric = True
        checks.dimensions = True
        checks.time_range = True
        checks.chart_type = True
        checks.sql_contains = True
    sql_reason: Optional[str] = None
    if exp.should_execute and sql_text:
        c_ok, s_ok, sql_reason = _sql_checks(sql_text, exp)
        checks.sql_contains = c_ok
        checks.sql_safety = s_ok
    elif not exp.should_execute:
        probe = sql_text or str(ft.get("sql", {}).get("final") or ft.get("sql", {}).get("draft") or "")
        _, s_ok, sql_reason = _sql_checks(probe, exp)
        checks.sql_contains = True
        checks.sql_safety = s_ok
        if exp.sql_must_contain:
            c_ok, _, sql_reason = _sql_checks(probe, exp)
            checks.sql_contains = c_ok
    if case.category == "guardrail":
        checks.guardrail = not exp.should_execute and not executed
        if sql_text:
            checks.sql_safety = all(x.upper() not in sql_text.upper() for x in (exp.sql_must_not_contain or []) if x)

    weights = {**checks.model_dump(), "confidence_min": conf_ok, "limit": limit_ok}
    score = sum(1.0 for v in weights.values() if v) / max(1, len(weights))
    passed = all(weights.values())

    failures: list[str] = []
    if not checks.intent and exp.intent:
        failures.append(f"intent: ожидали {exp.intent}, получили {intent}")
    if not checks.metric and exp.metric:
        failures.append(f"metric: ожидали {exp.metric}, получили {metric}")
    if not checks.dimensions and exp.dimensions:
        failures.append(f"dimensions: ожидали {exp.dimensions}, получили {dims}")
    if not time_ok and exp.time_range not in (None, "", "unknown"):
        failures.append(f"time_range: ожидали {exp.time_range}, получили {tr_token}")
    if not chart_ok and exp.chart_type:
        failures.append(f"chart: ожидали {exp.chart_type}, получили {chart}")
    if not checks.clarification:
        failures.append(f"clarification: ожидали {exp.requires_clarification}, получили {clar}")
    if not checks.guardrail:
        failures.append(f"execution: ожидали should_execute={exp.should_execute}, executed={executed}")
    if not checks.sql_contains or not checks.sql_safety:
        failures.append(sql_reason or "sql check failed")
    if not conf_ok and exp.confidence_min is not None:
        failures.append(f"confidence {conf} < min {exp.confidence_min}")
    if not limit_ok and exp.limit is not None:
        failures.append(f"limit: ожидали {exp.limit}")

    interp = _interpretation_block(
        intent=intent,
        metric=metric,
        dimensions=dims,
        time_range=tr_token,
        filters=_filters_from_entities(ent_d),
        chart_type=chart,
        confidence=conf,
        requires_clarification=clar,
        clarification_question=(res.clarification_question or None) or None,
    )
    actual_payload = {
        **interp,
        "should_execute": executed,
        "sql": sql_text,
        "trace": _trace_steps_for_ui(ft),
        "raw_trace_steps": trace_steps_from_full_trace(ft),
        "execution_status": res.execution_status,
        "sql_validation_ok": sql_val,
        "inheritance_trace": (ft.get("dialogue") or {}).get("inheritance_trace") if isinstance(ft.get("dialogue"), dict) else None,
    }

    return CaseEvaluationResult(
        id=case.id,
        prompt=case.prompt,
        category=case.category,
        passed=passed,
        score=round(score, 4),
        expected=exp.model_dump(),
        actual=actual_payload,
        checks=checks,
        failure_reason="; ".join(failures) if failures else None,
    )


def _mean(vals: list[bool]) -> float:
    if not vals:
        return 0.0
    return round(sum(1 for v in vals if v) / len(vals), 4)


def _build_summary(results: list[CaseEvaluationResult], *, mode: EvaluationMode) -> EvaluationSummary:
    n = len(results)
    passed = sum(1 for r in results if r.passed)

    def pick(field: str) -> list[bool]:
        return [bool(getattr(r.checks, field)) for r in results]

    clar_cases = [r for r in results if r.category == "clarification"]
    guard_cases = [r for r in results if r.category == "guardrail"]
    sql_val_flags: list[bool] = []
    for r in results:
        if not r.expected.get("should_execute"):
            continue
        ok = r.actual.get("sql_validation_ok")
        if ok is None:
            sql_val_flags.append(r.checks.sql_safety and r.checks.sql_contains)
        else:
            sql_val_flags.append(bool(ok))

    return EvaluationSummary(
        total_cases=n,
        passed_cases=passed,
        failed_cases=n - passed,
        overall_accuracy=round(passed / n, 4) if n else 0.0,
        intent_accuracy=_mean(pick("intent")),
        metric_accuracy=_mean(pick("metric")),
        dimension_accuracy=_mean(pick("dimensions")),
        time_range_accuracy=_mean(pick("time_range")),
        chart_accuracy=_mean(pick("chart_type")),
        clarification_accuracy=_mean([r.checks.clarification for r in clar_cases]) if clar_cases else 1.0,
        guardrail_accuracy=_mean([r.checks.guardrail for r in guard_cases]) if guard_cases else 1.0,
        sql_validation_pass_rate=_mean(sql_val_flags) if sql_val_flags else 1.0,
        confidence_average=round(sum(float(r.actual.get("confidence") or 0) for r in results) / max(1, n), 4),
        updated_at=utc_now_iso(),
        mode=mode,
        deterministic_eval=mode != "live",
    )


def run_nl_sql_understanding_evaluation(
    mode: EvaluationMode = "mock",
) -> tuple[EvaluationSummary, list[CaseEvaluationResult]]:
    global _LAST_SUMMARY, _LAST_CASES
    cases = load_understanding_cases()
    results: list[CaseEvaluationResult] = []
    with evaluation_runtime_context(mode):
        for c in cases:
            try:
                results.append(_evaluate_one(c))
            except Exception as exc:  # noqa: BLE001
                logger.exception("understanding_case_failed id=%s", c.id)
                results.append(
                    CaseEvaluationResult(
                        id=c.id,
                        prompt=c.prompt,
                        category=c.category,
                        passed=False,
                        score=0.0,
                        expected=c.expected.model_dump(),
                        actual={"error": str(exc)[:500], "trace": []},
                        checks=CaseChecks(
                            intent=False,
                            metric=False,
                            dimensions=False,
                            time_range=False,
                            chart_type=False,
                            clarification=False,
                            guardrail=False,
                            sql_contains=False,
                            sql_safety=False,
                        ),
                        failure_reason=f"exception: {exc}",
                    )
                )
    summary = _build_summary(results, mode=mode)
    _LAST_SUMMARY = summary
    _LAST_CASES = results
    return summary, results
