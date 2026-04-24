"""Прогон SQL Correctness: фрагменты, таблицы, валидация, опционально live scalar compare.

Базовый путь детерминированный (IntentService без LLM → SemanticParser → SQLGenerationService),
как в tests/orchestration/test_sql_generation_accuracy.py.
Для mode=live можно включить сравнение scalar(actual_sql) с scalar(reference_sql_live).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Optional

from app.core.config import settings
from app.db.session import engine
from app.schemas.evaluation_sql_correctness import (
    EvaluationMode,
    SqlCorrectnessCase,
    SqlCorrectnessCaseChecks,
    SqlCorrectnessCaseResult,
    SqlCorrectnessDatasetFile,
    SqlCorrectnessSummary,
    utc_now_iso,
)
from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.semantic_parser import SemanticParser
from app.services.orchestration.semantic_service import SemanticService
from app.services.orchestration.sql_generation_service import SQLGenerationService
from app.services.sql_validation import get_sql_validator
from app.services.sql_validation.utils import extract_from_join_tables, normalize_for_checks
from sqlalchemy import text

logger = logging.getLogger(__name__)

_LAST_SUMMARY: Optional[SqlCorrectnessSummary] = None
_LAST_CASES: list[SqlCorrectnessCaseResult] = []


def _dataset_path() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "evals" / "golden" / "sql_correctness_cases.json"


def load_sql_correctness_cases() -> list[SqlCorrectnessCase]:
    raw = json.loads(_dataset_path().read_text(encoding="utf-8"))
    data = SqlCorrectnessDatasetFile.model_validate(raw)
    return list(data.cases)


def load_sql_correctness_cases_public() -> list[dict[str, str]]:
    return [{"id": c.id, "prompt": c.prompt, "role": c.role} for c in load_sql_correctness_cases()]


def get_last_sql_correctness_summary() -> tuple[Optional[SqlCorrectnessSummary], list[SqlCorrectnessCaseResult]]:
    return _LAST_SUMMARY, list(_LAST_CASES)


def _deterministic_sql_from_prompt(prompt: str) -> tuple[str, str, dict[str, Any]]:
    """Повторяет порядок сущностей как в QueryOrchestrator (без LLM и без notebook_context)."""
    isvc = IntentService(llm_service=None)
    intent_res = isvc.classify_intent(prompt)
    entities = isvc.extract_entities(prompt)
    if intent_res.entities:
        entities.update(intent_res.entities)
    parser = SemanticParser()
    _interp, patch = parser.build(
        effective_query=prompt,
        intent=intent_res.intent,
        intent_signals=intent_res.signals,
        entities=dict(entities),
    )
    merged = dict(entities)
    for k, v in patch.items():
        if v is not None and v != "":
            merged[k] = v
    sem = SemanticService()
    resolutions = sem.resolve_with_hint(prompt, str(merged.get("metric_hint") or ""))
    metric_sql = sem.primary_metric_sql(resolutions)
    sql = SQLGenerationService().generate(
        intent=intent_res.intent,
        entities=merged,
        metric_sql=metric_sql,
        use_campaigns_only=False,
        workspace_id=None,
    )
    return sql, str(intent_res.intent), merged


def _scalars_equal(a: Any, b: Any) -> bool:
    if a == b:
        return True
    try:
        return float(a) == float(b)
    except Exception:  # noqa: BLE001
        return str(a) == str(b)


def _live_scalar_compare(
    *,
    actual_sql: str,
    reference_sql: str,
    min_train_rows: int,
) -> tuple[bool, str, Any, Any]:
    if not actual_sql.strip() or not reference_sql.strip():
        return False, "missing_sql", None, None
    try:
        with engine.connect() as conn:
            if min_train_rows > 0:
                n = conn.execute(text("SELECT COUNT(*)::bigint FROM public.train")).scalar_one()
                if int(n or 0) < min_train_rows:
                    return True, "skipped_insufficient_rows", None, None
            av = conn.execute(text(actual_sql)).scalar_one()
            rv = conn.execute(text(reference_sql)).scalar_one()
    except Exception as exc:  # noqa: BLE001
        return False, f"db_error:{exc.__class__.__name__}", None, None
    ok = _scalars_equal(av, rv)
    return ok, "passed" if ok else "mismatch", av, rv


def _evaluate_one(case: SqlCorrectnessCase, mode: EvaluationMode) -> SqlCorrectnessCaseResult:
    spec = case.checks
    sql_text, intent_str, merged = _deterministic_sql_from_prompt(case.prompt)
    vres = get_sql_validator().validate(
        sql_text,
        role_key=case.role,
        intent=intent_str,
        entities=dict(merged),
    )
    val_ok = bool(vres.is_valid)
    norm = normalize_for_checks(sql_text) if sql_text else ""

    non_empty = bool(sql_text.strip())
    frag_ok = all(f.strip().lower() in norm for f in spec.required_fragments_normalized if f.strip())
    forbid_ok = all(f.strip().lower() not in norm for f in spec.forbidden_fragments_normalized if f.strip())
    implicit = (settings.sql_implicit_schema or "public").strip().lower() or "public"
    tables_found = extract_from_join_tables(norm, implicit) if norm else set()
    tab_ok = all(t.strip().lower() in tables_found for t in spec.required_tables if t.strip())

    gold = (spec.gold_normalized_sql or "").strip()
    if gold:
        gold_norm = normalize_for_checks(gold)
        gold_ok = bool(norm) and norm == gold_norm
    else:
        gold_ok = True

    if spec.require_sql_validation_pass:
        val_check = val_ok is not False
    else:
        val_check = True

    failures: list[str] = []
    if not non_empty:
        failures.append("пустой SQL")
    if not frag_ok:
        failures.append("не хватает обязательных фрагментов (нормализованный SQL)")
    if not forbid_ok:
        failures.append("найдены запрещённые фрагменты")
    if not tab_ok:
        failures.append(f"таблицы: ожидали {spec.required_tables}, в запросе {sorted(tables_found)}")
    if gold and not gold_ok:
        failures.append("расхождение с gold_normalized_sql")
    if spec.require_sql_validation_pass and val_ok is False:
        failures.append("sql_validation.is_valid = false")

    scalar_live_ok = True
    scalar_live_status = "not_requested"
    actual_scalar: Any = None
    ref_scalar: Any = None
    if mode == "live" and spec.compare_scalar_in_live and (spec.reference_sql_live or "").strip():
        scalar_live_ok, scalar_live_status, actual_scalar, ref_scalar = _live_scalar_compare(
            actual_sql=sql_text,
            reference_sql=str(spec.reference_sql_live or ""),
            min_train_rows=max(0, int(spec.min_train_rows_for_live_compare)),
        )
        if not scalar_live_ok:
            failures.append(f"live scalar compare failed: {scalar_live_status}")

    checks = SqlCorrectnessCaseChecks(
        fragments=frag_ok,
        forbidden=forbid_ok,
        tables=tab_ok,
        gold_normalized=gold_ok,
        scalar_live=scalar_live_ok,
        sql_validation=val_check,
        generated_non_empty=non_empty,
    )
    weights = checks.model_dump()
    score = sum(1.0 for v in weights.values() if v) / max(1, len(weights))
    passed = all(weights.values())

    return SqlCorrectnessCaseResult(
        id=case.id,
        prompt=case.prompt,
        passed=passed,
        score=round(score, 4),
        checks=checks,
        expected=spec.model_dump(),
        actual={
            "sql": sql_text[:8000],
            "normalized_preview": norm[:2000],
            "tables_referenced": sorted(tables_found),
            "sql_validation_ok": val_ok,
            "execution_status": "deterministic_sql_path",
            "intent": intent_str,
            "live_scalar_status": scalar_live_status,
            "live_scalar_actual": actual_scalar,
            "live_scalar_reference": ref_scalar,
        },
        failure_reason="; ".join(failures) if failures else None,
    )


def _mean(vals: list[bool]) -> float:
    if not vals:
        return 0.0
    return round(sum(1 for v in vals if v) / len(vals), 4)


def _build_summary(results: list[SqlCorrectnessCaseResult], *, mode: EvaluationMode) -> SqlCorrectnessSummary:
    n = len(results)
    passed = sum(1 for r in results if r.passed)
    return SqlCorrectnessSummary(
        total_cases=n,
        passed_cases=passed,
        failed_cases=n - passed,
        overall_accuracy=round(passed / n, 4) if n else 0.0,
        fragment_pass_rate=_mean([r.checks.fragments for r in results]),
        table_pass_rate=_mean([r.checks.tables for r in results]),
        gold_exact_pass_rate=_mean([r.checks.gold_normalized for r in results]),
        live_scalar_pass_rate=_mean([r.checks.scalar_live for r in results]),
        live_scalar_coverage=_mean(
            [str(r.actual.get("live_scalar_status") or "") != "not_requested" for r in results]
        ),
        sql_validation_pass_rate=_mean([r.checks.sql_validation for r in results]),
        updated_at=utc_now_iso(),
        mode=mode,
    )


def run_sql_correctness_evaluation(mode: EvaluationMode = "mock") -> tuple[SqlCorrectnessSummary, list[SqlCorrectnessCaseResult]]:
    global _LAST_SUMMARY, _LAST_CASES
    cases = load_sql_correctness_cases()
    results: list[SqlCorrectnessCaseResult] = []
    for c in cases:
        try:
            results.append(_evaluate_one(c, mode))
        except Exception as exc:  # noqa: BLE001
            logger.exception("sql_correctness_case_failed id=%s", c.id)
            results.append(
                SqlCorrectnessCaseResult(
                    id=c.id,
                    prompt=c.prompt,
                    passed=False,
                    score=0.0,
                    checks=SqlCorrectnessCaseChecks(
                        fragments=False,
                        forbidden=False,
                        tables=False,
                        gold_normalized=False,
                        scalar_live=False,
                        sql_validation=False,
                        generated_non_empty=False,
                    ),
                    expected=c.checks.model_dump(),
                    actual={"error": str(exc)[:500]},
                    failure_reason=f"exception: {exc}",
                )
            )
    summary = _build_summary(results, mode=mode)
    _LAST_SUMMARY = summary
    _LAST_CASES = results
    return summary, results
