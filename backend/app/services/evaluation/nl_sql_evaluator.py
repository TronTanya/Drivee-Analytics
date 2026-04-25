"""Golden NL→SQL evaluation: загрузка кейсов, прогон через orchestrator, сводка метрик."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from app.schemas.evaluation_nl_sql import (
    CaseChecks,
    CaseEvaluationResult,
    EvaluationMode,
    EvaluationSummary,
    GoldenCase,
    GoldenCasePublic,
    GoldenDatasetFile,
    utc_now_iso,
)
from app.services.analytics_pipeline import analyze_natural_language
from app.services.evaluation.base_evaluator import evaluation_runtime_context

logger = logging.getLogger(__name__)

_LAST_SUMMARY: Optional[EvaluationSummary] = None
_LAST_CASES: list[CaseEvaluationResult] = []


def _golden_json_path() -> Path:
    # Датасет в корне backend/evals (удобно для версионирования и CI); не внутри пакета app.
    return Path(__file__).resolve().parents[3] / "evals" / "nl_sql_golden_cases.json"


def load_golden_cases() -> list[GoldenCase]:
    path = _golden_json_path()
    raw = json.loads(path.read_text(encoding="utf-8"))
    data = GoldenDatasetFile.model_validate(raw)
    return list(data.cases)


def load_golden_cases_public() -> list[GoldenCasePublic]:
    return [
        GoldenCasePublic(id=c.id, category=c.category, prompt=c.prompt, role=c.role)
        for c in load_golden_cases()
    ]


def get_last_evaluation_summary() -> tuple[Optional[EvaluationSummary], list[CaseEvaluationResult]]:
    return _LAST_SUMMARY, list(_LAST_CASES)


def _time_range_token(entities: dict[str, Any]) -> str:
    if not isinstance(entities, dict):
        return "unknown"
    if entities.get("time_period"):
        return str(entities["time_period"])
    if entities.get("window_days") is not None:
        try:
            return f"rolling_{int(entities['window_days'])}d"
        except (TypeError, ValueError):
            pass
    if entities.get("window_weeks") is not None:
        try:
            return f"rolling_{int(entities['window_weeks'])}w"
        except (TypeError, ValueError):
            pass
    if entities.get("calendar_year") is not None:
        try:
            return f"calendar_year_{int(entities['calendar_year'])}"
        except (TypeError, ValueError):
            pass
    return "unknown"


def _dimensions_from_trace(ft: dict[str, Any]) -> list[str]:
    entities = ft.get("entities")
    if isinstance(entities, dict):
        dims = entities.get("dimensions")
        if isinstance(dims, list):
            return [str(d) for d in dims if d is not None]
    si = ft.get("structured_interpretation")
    if isinstance(si, dict):
        dims = si.get("dimensions")
        if isinstance(dims, list):
            return [str(d) for d in dims if d is not None]
    return []


def _metric_from_result(parsed: dict[str, str], ft: dict[str, Any]) -> str:
    m = (parsed.get("metric") or "").strip()
    if m and m != "conversation":
        return m
    entities = ft.get("entities")
    if isinstance(entities, dict):
        ck = str(entities.get("canonical_metric_key") or "").strip()
        if ck:
            return ck
    terms = ft.get("semantic_terms")
    if isinstance(terms, list) and terms:
        t0 = terms[0]
        if isinstance(t0, dict) and t0.get("term_key"):
            return str(t0["term_key"])
    return m


def _filters_from_entities(entities: dict[str, Any]) -> list[dict[str, Any]]:
    skip = frozenset(
        {
            "dimensions",
            "canonical_metric_key",
            "metric_hint",
            "time_grain",
            "time_period",
            "window_days",
            "window_weeks",
            "calendar_year",
            "forecast_horizon_steps",
            "top_n",
            "compare_baseline",
            "query_scope",
            "dual_accept_cancel_counts",
        }
    )
    out: list[dict[str, Any]] = []
    for k, v in entities.items():
        if k in skip or v is None or v == "":
            continue
        if isinstance(v, (dict, list)) and k not in ("status_filters",):
            continue
        out.append({"field": k, "value": v})
    return out[:24]


def _sql_validation_ok(ft: dict[str, Any]) -> Optional[bool]:
    sv = ft.get("sql_validation")
    if isinstance(sv, dict) and "is_valid" in sv:
        return bool(sv["is_valid"])
    return None


def _should_have_executed(execution_status: str, clarification_required: bool, ft: dict[str, Any]) -> bool:
    if clarification_required or execution_status == "clarification_required":
        return False
    g = ft.get("guardrails")
    if isinstance(g, dict) and g.get("blocked"):
        return False
    if execution_status == "succeeded":
        return True
    return False


def _trace_steps_for_ui(ft: dict[str, Any]) -> list[dict[str, Any]]:
    steps = ft.get("pipeline_steps")
    if not isinstance(steps, list):
        return []
    out: list[dict[str, Any]] = []
    for s in steps:
        if not isinstance(s, dict):
            continue
        name = str(s.get("name") or "step")
        ok = bool(s.get("ok", True))
        msg = _step_message_ru(name, ok, s.get("detail") or {})
        out.append({"step": name, "status": "passed" if ok else "failed", "message": msg})
    return out


def _step_message_ru(name: str, ok: bool, detail: Any) -> str:
    detail_d = detail if isinstance(detail, dict) else {}
    if name == "classify_intent":
        return f"Intent: {detail_d.get('intent', '—')}" + ("" if ok else " — ошибка классификации")
    if name == "semantic_parse":
        return "Семантический разбор интерпретации" if ok else "Семантический разбор: проблема"
    if name == "resolve_semantic_terms":
        return "Сопоставление метрик со словарём" if ok else "Семантика: требуется внимание"
    if name == "clarification_engine":
        if detail_d.get("required"):
            return "Запрос неоднозначен — нужно уточнение"
        return "Уточнение не требуется"
    if name == "guardrails_policy":
        return "Политики безопасности" if ok else "Запрос заблокирован политиками"
    if name == "validate_sql":
        return "SQL прошёл валидацию" if ok else "SQL не прошёл валидацию"
    if name == "generate_sql":
        return "SQL сгенерирован"
    if name == "execute_sql":
        return "Запрос выполнен" if ok else "Ошибка выполнения"
    if name == "recommend_chart_type":
        return "Рекомендация типа графика"
    return name


def _interpretation_block(
    *,
    intent: str,
    metric: str,
    dimensions: list[str],
    time_range: str,
    filters: list[dict[str, Any]],
    chart_type: str,
    confidence: float,
    requires_clarification: bool,
    clarification_question: Optional[str],
) -> dict[str, Any]:
    return {
        "intent": intent,
        "metric": metric,
        "dimensions": list(dimensions),
        "time_range": time_range,
        "filters": filters,
        "chart_type": chart_type,
        "confidence": confidence,
        "requires_clarification": requires_clarification,
        "clarification_question": clarification_question,
    }


def _check_str(expected: Optional[str], actual: str) -> bool:
    if expected is None or expected == "":
        return True
    return (actual or "").strip().lower() == str(expected).strip().lower()


def _check_dims(expected: list[str], actual: list[str]) -> bool:
    if not expected:
        return True
    exp = {str(x).strip().lower() for x in expected if x}
    act = {str(x).strip().lower() for x in actual if x}
    return exp == act


def _sql_checks(sql: str, exp: Any) -> tuple[bool, bool, Optional[str]]:
    sql_u = (sql or "").upper()
    must = list(exp.sql_must_contain or [])
    must_not = list(exp.sql_must_not_contain or [])
    ok_contains = all(s.upper() in sql_u for s in must if s)
    ok_safe = all(s.upper() not in sql_u for s in must_not if s)
    reason = None
    if must and not ok_contains:
        reason = f"SQL не содержит обязательных фрагментов: {must}"
    elif must_not and not ok_safe:
        reason = "SQL содержит запрещённые конструкции"
    return ok_contains, ok_safe, reason


def _evaluate_single(case: GoldenCase) -> CaseEvaluationResult:
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

    time_ok = True
    if exp.time_range not in (None, "", "unknown"):
        time_ok = _check_str(exp.time_range, tr_token)
    chart_ok = True
    if exp.chart_type not in (None, ""):
        chart_ok = _check_str(exp.chart_type, chart)

    checks = CaseChecks(
        intent=_check_str(exp.intent, intent),
        metric=_check_str(exp.metric, metric),
        dimensions=_check_dims(list(exp.dimensions or []), dims),
        time_range=time_ok,
        chart_type=chart_ok,
        clarification=(clar == exp.requires_clarification),
        guardrail=(executed == exp.should_execute),
        sql_contains=True,
        sql_safety=True,
    )
    if case.category == "clarification":
        # До ответа пользователя каноническая метрика намеренно не зафиксирована.
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
        # Для guardrail/clarification не требуем SELECT; проверяем только safety по тому SQL, что есть.
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

    # SQL validation rate: только для кейсов, где ожидается успешное выполнение
    if exp.should_execute and sql_val is not None:
        pass  # учитываем в summary отдельно

    weights = checks.model_dump()
    score = sum(1.0 for v in weights.values() if v) / max(1, len(weights))
    passed = all(weights.values())

    failures: list[str] = []
    if not checks.intent and exp.intent:
        failures.append(f"intent: ожидали {exp.intent}, получили {intent}")
    if not checks.metric and exp.metric:
        failures.append(f"metric: ожидали {exp.metric}, получили {metric}")
    if not checks.dimensions and exp.dimensions:
        failures.append(f"dimensions: ожидали {exp.dimensions}, получили {dims}")
    if not checks.time_range and exp.time_range not in (None, "", "unknown"):
        failures.append(f"time_range: ожидали {exp.time_range}, получили {tr_token}")
    if not checks.chart_type and exp.chart_type:
        failures.append(f"chart: ожидали {exp.chart_type}, получили {chart}")
    if not checks.clarification:
        failures.append(
            f"clarification: ожидали requires_clarification={exp.requires_clarification}, получили {clar}"
        )
    if not checks.guardrail:
        failures.append(f"execution: ожидали should_execute={exp.should_execute}, фактически executed={executed}")
    if not checks.sql_contains or not checks.sql_safety:
        failures.append(sql_reason or "sql check failed")

    actual_trace = _trace_steps_for_ui(ft)
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
    explanation = str(ft.get("explainability_text") or res.insight or "")

    actual_payload = {
        **interp,
        "should_execute": executed,
        "sql": sql_text,
        "trace": actual_trace,
        "execution_status": res.execution_status,
        "sql_validation_ok": sql_val,
        "explanation": explanation[:2000],
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


def _build_summary(
    results: list[CaseEvaluationResult],
    *,
    mode: EvaluationMode,
    deterministic_eval: bool,
) -> EvaluationSummary:
    n = len(results)
    passed = sum(1 for r in results if r.passed)

    def pick(cat: str, field: str) -> list[bool]:
        out: list[bool] = []
        for r in results:
            if cat != "all" and r.category != cat:
                continue
            v = getattr(r.checks, field)
            out.append(bool(v))
        return out

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
        intent_accuracy=_mean(pick("all", "intent")),
        metric_accuracy=_mean(pick("all", "metric")),
        dimension_accuracy=_mean(pick("all", "dimensions")),
        time_range_accuracy=_mean(pick("all", "time_range")),
        chart_accuracy=_mean(pick("all", "chart_type")),
        clarification_accuracy=_mean([r.checks.clarification for r in clar_cases]) if clar_cases else 1.0,
        guardrail_accuracy=_mean([r.checks.guardrail for r in guard_cases]) if guard_cases else 1.0,
        sql_validation_pass_rate=_mean(sql_val_flags) if sql_val_flags else 1.0,
        confidence_average=round(
            sum(float(r.actual.get("confidence") or 0) for r in results) / max(1, n),
            4,
        ),
        updated_at=utc_now_iso(),
        mode=mode,
        deterministic_eval=deterministic_eval,
    )


def run_nl_sql_evaluation(mode: EvaluationMode = "mock") -> tuple[EvaluationSummary, list[CaseEvaluationResult]]:
    global _LAST_SUMMARY, _LAST_CASES
    cases = load_golden_cases()
    deterministic_eval = mode == "deterministic"
    results: list[CaseEvaluationResult] = []
    with evaluation_runtime_context(mode):
        for c in cases:
            try:
                results.append(_evaluate_single(c))
            except Exception as exc:  # noqa: BLE001
                logger.exception("golden_case_failed id=%s", c.id)
                results.append(
                    CaseEvaluationResult(
                        id=c.id,
                        prompt=c.prompt,
                        category=c.category,
                        passed=False,
                        score=0.0,
                        expected=c.expected.model_dump(),
                        actual={
                            "intent": "error",
                            "metric": "",
                            "dimensions": [],
                            "time_range": "",
                            "filters": [],
                            "chart_type": "",
                            "confidence": 0.0,
                            "requires_clarification": False,
                            "clarification_question": None,
                            "should_execute": False,
                            "sql": "",
                            "trace": [],
                            "error": str(exc)[:500],
                        },
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
                        failure_reason=f"orchestrator_exception: {exc}",
                    )
                )
    summary = _build_summary(results, mode=mode, deterministic_eval=deterministic_eval)
    _LAST_SUMMARY = summary
    _LAST_CASES = results
    return summary, results
