from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
import json
import math
import re
from typing import Any, Literal, Optional
from uuid import uuid4

import logging

import pandas as pd
from sqlalchemy import desc, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.data_pipeline import DataImportJob
from app.schemas.analytics import RunAnalyticsResponse
from app.schemas.orchestration import OrchestrationInput
from app.schemas.trace_payload import (
    AnalyticsExplainabilityTraceV1,
    ChartRecommendationTrace,
    ExecutionPhaseTrace,
    ForecastSelectionTrace,
    ForecastModeTrace,
    GuardrailsTrace,
    QualityGateTrace,
    SemanticTermTraceItem,
    ValidationStatusLiteral,
)
from app.schemas.clarification import clarification_reason_summary_ru
from app.schemas.pipeline import PipelineCellItem
from app.services.analytics_post_process import post_process_sql_result
from app.services.orchestration.query_orchestrator import (
    QueryOrchestrator,
    build_default_orchestrator,
    build_orchestrator_with_learning,
)

logger = logging.getLogger(__name__)


def _coerce_unit_interval(value: Any, *, default: float = 0.0) -> float:
    """Для trace/UI: безопасное число в [0, 1] (OrchestrationOutput иногда даёт edge-case из провайдеров)."""
    try:
        x = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(x):
        return default
    return max(0.0, min(1.0, x))


def _optional_forecast_horizon(value: Any) -> Optional[int]:
    """Целое 1…90 из контекста ноутбука или None."""
    if value is None:
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    if n < 1:
        return None
    return min(90, n)


@dataclass
class NaturalLanguageAnalysisResult:
    prompt: str
    safe_sql: str
    table_records: list[dict] = field(default_factory=list)
    chart_hint: str = ""
    chart_type: str = "line"
    insight: str = ""
    forecast_records: list[dict] = field(default_factory=list)
    trace_summary: str = ""
    confidence: float = 0.82
    warnings: list[str] = field(default_factory=list)
    used_tables: list[str] = field(default_factory=list)
    used_columns: list[str] = field(default_factory=list)
    parsed: dict[str, str] = field(default_factory=dict)
    full_trace: dict[str, Any] = field(default_factory=dict)
    execution_status: str = "succeeded"
    clarification_required: bool = False
    clarification_reason: str = ""
    clarification_reason_summary_ru: str = ""
    clarification_question: str = ""
    clarification_options: list[dict[str, str]] = field(default_factory=list)
    dialogue: dict[str, Any] = field(default_factory=dict)
    visualization: dict[str, Any] = field(default_factory=dict)
    sql_generation_source: str = "default_template"
    applied_correction_id: Optional[str] = None
    correction_similarity: Optional[float] = None
    correction_match_kind: Optional[str] = None
    # После enrich_notebook_context: фактическая таблица/вью для SQL (для снимков ячейки и отчётов).
    resolved_source_table: str = ""


_FROM_JOIN_TABLE_RE = re.compile(r"\b(?:from|join)\s+([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)\b", re.IGNORECASE)


def _extract_tables_from_sql(sql: str) -> list[str]:
    if not sql:
        return []
    out: list[str] = []
    seen: set[str] = set()
    for m in _FROM_JOIN_TABLE_RE.finditer(sql):
        table = str(m.group(1) or "").strip().lower()
        if not table or table in seen:
            continue
        seen.add(table)
        out.append(table)
    return out


_PHASE_SPECS: list[tuple[str, str, frozenset[str]]] = [
    (
        "parsing",
        "Парсинг и интерпретация",
        frozenset(
            {
                "preprocess_query",
                "llm_intelligence_layer",
                "dialogue_context",
                "classify_intent",
                "extract_entities",
                "resolve_semantic_terms",
                "clarification_engine",
                "compute_confidence_score",
                "awaiting_user_clarification",
                "guardrails_policy",
                "orchestration",
            }
        ),
    ),
    ("generating_sql", "Генерация SQL", frozenset({"correction_learning", "generate_sql"})),
    ("validating", "Проверка SQL", frozenset({"validate_sql"})),
    ("executing", "Выполнение запроса", frozenset({"execute_sql", "normalize_dimensions"})),
    ("visualizing", "Визуализация", frozenset({"recommend_chart_type"})),
    (
        "done",
        "Инсайт и финализация",
        frozenset(
            {
                "generate_insight",
                "generate_explainability",
                "forecast_sidecar",
                "build_trace_payload",
                "persist_results",
            }
        ),
    ),
]


def enrich_notebook_context_for_orchestration(notebook_context: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Единая точка: явный source_table из контекста иначе канонический датасет (train), опционально — последний staging."""
    ctx = dict(notebook_context or {})
    explicit = ctx.get("source_table") or ctx.get("ds_staging_qualified")
    if isinstance(explicit, str) and explicit.strip():
        st = explicit.strip()
        ctx["source_table"] = st
        ctx["ds_staging_qualified"] = st
        return ctx
    if bool(getattr(settings, "ds_implicit_source_use_latest_staging", False)):
        source_table = _latest_staging_source_table() or settings.ds_default_source_table
    else:
        source_table = settings.ds_default_source_table
    ctx["source_table"] = source_table
    ctx["ds_staging_qualified"] = source_table
    return ctx


def _step_ok_for_phase(name: str, ok: bool, awaiting_clarification: bool) -> bool:
    if name == "clarification_engine" and not ok and awaiting_clarification:
        return True
    return ok


def build_execution_phases(result: NaturalLanguageAnalysisResult, ft: dict[str, Any]) -> list[ExecutionPhaseTrace]:
    raw = ft.get("pipeline_steps")
    if not isinstance(raw, list):
        raw = []
    step_records: list[tuple[str, bool]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        n = str(item.get("name") or "").strip()
        if not n:
            continue
        step_records.append((n, bool(item.get("ok", True))))
    awaiting_clarification = any(n == "awaiting_user_clarification" for n, _ in step_records)

    def ok_for(name: str, step_ok: bool) -> bool:
        return _step_ok_for_phase(name, step_ok, awaiting_clarification)

    phases: list[ExecutionPhaseTrace] = []
    saw_failure = False
    for phase_id, label, members in _PHASE_SPECS:
        present = [n for n, ok in step_records if n in members]
        if saw_failure and not present:
            phases.append(ExecutionPhaseTrace(phase_id=phase_id, label=label, status="skipped", detail=""))
            continue
        if not present:
            phases.append(ExecutionPhaseTrace(phase_id=phase_id, label=label, status="skipped", detail=""))
            continue
        failed = [n for n, ok in step_records if n in members and not ok_for(n, ok)]
        if failed:
            saw_failure = True
            phases.append(
                ExecutionPhaseTrace(
                    phase_id=phase_id,
                    label=label,
                    status="failed",
                    detail=", ".join(failed),
                )
            )
            continue
        phases.append(ExecutionPhaseTrace(phase_id=phase_id, label=label, status="done", detail=""))
    return phases


def _latest_staging_source_table() -> Optional[str]:
    """Best-effort: при любой ошибке БД возвращаем None (используется ds_default_source_table)."""
    try:
        session = SessionLocal()
    except Exception as exc:  # noqa: BLE001
        logger.warning("latest_staging_source_session_failed error=%s", exc)
        return None
    try:
        stmt = (
            select(DataImportJob)
            .where(DataImportJob.job_status == "succeeded")
            .order_by(desc(DataImportJob.finished_at), desc(DataImportJob.created_at))
            .limit(1)
        )
        job = session.execute(stmt).scalar_one_or_none()
        if not job:
            return None
        tconf = dict(job.transform_config_json or {})
        table = tconf.get("qualified_table")
        if isinstance(table, str) and table.strip():
            return table.strip()
        return None
    except SQLAlchemyError as exc:
        logger.warning("latest_staging_source_lookup_failed sqlalchemy=%s", exc)
        return None
    except Exception as exc:  # noqa: BLE001
        logger.warning("latest_staging_source_lookup_failed error=%s", exc)
        return None
    finally:
        session.close()


def _interpreted_intent_line(result: NaturalLanguageAnalysisResult, ft: dict[str, Any]) -> str:
    intent = str(ft.get("intent") or result.parsed.get("intent") or "").strip()
    metric = str(result.parsed.get("metric") or "").strip()
    if intent and metric:
        return f"{intent} · {metric}"
    return intent or metric or result.trace_summary or ""


def _semantic_terms_from_trace(ft: dict[str, Any]) -> list[SemanticTermTraceItem]:
    raw = ft.get("semantic_terms")
    if not isinstance(raw, list):
        return []
    out: list[SemanticTermTraceItem] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        try:
            conf = float(item.get("confidence", 1.0))
        except (TypeError, ValueError):
            conf = 1.0
        out.append(
            SemanticTermTraceItem(
                term_key=str(item.get("term_key", "") or ""),
                surface_form=str(item.get("surface_form", "") or ""),
                sql_fragment=str(item.get("sql_fragment", "") or ""),
                confidence=max(0.0, min(1.0, conf)),
            )
        )
    return out


def _generated_sql(ft: dict[str, Any], result: NaturalLanguageAnalysisResult) -> str:
    sql_block = ft.get("sql")
    if isinstance(sql_block, dict):
        for key in ("final", "draft"):
            candidate = sql_block.get(key)
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
    return (result.safe_sql or "").strip()


def _validation_status(result: NaturalLanguageAnalysisResult) -> ValidationStatusLiteral:
    if result.clarification_required:
        return "pending"
    if result.execution_status == "succeeded":
        return "passed"
    return "failed"


def _forecast_mode(ft: dict[str, Any], result: NaturalLanguageAnalysisResult) -> ForecastModeTrace:
    fc = ft.get("forecast_mode") or ft.get("forecast") or {}
    if isinstance(fc, dict):
        active = bool(fc.get("active", False))
        method = fc.get("method")
        method_str = str(method) if method else None
        if not active and result.forecast_records:
            return ForecastModeTrace(active=True, method=method_str or "baseline_linear_trend")
        return ForecastModeTrace(active=active, method=method_str)
    if result.forecast_records:
        return ForecastModeTrace(active=True, method="baseline_linear_trend")
    return ForecastModeTrace()


def _chart_rec(result: NaturalLanguageAnalysisResult, ft: dict[str, Any]) -> ChartRecommendationTrace:
    viz = ft.get("visualization")
    if isinstance(viz, dict):
        return ChartRecommendationTrace(
            chart_type=str(viz.get("recommended_chart_type") or result.chart_type or "line"),
            rationale=str(viz.get("visualization_explanation") or result.chart_hint or ""),
            alternatives=[str(x) for x in (viz.get("alternative_chart_types") or []) if x is not None],
            confidence=float(viz.get("visualization_confidence") or 0.0),
            axes_hint=str(viz.get("axes_hint") or ""),
            series_keys=[str(x) for x in (viz.get("series_keys") or []) if x is not None],
        )
    ch = ft.get("chart")
    if isinstance(ch, dict):
        return ChartRecommendationTrace(
            chart_type=str(ch.get("chart_type") or result.chart_type or "line"),
            rationale=str(ch.get("rationale") or result.chart_hint or ""),
            alternatives=[str(x) for x in (ch.get("alternatives") or []) if x is not None],
            confidence=float(ch.get("confidence") or 0.0),
            axes_hint=str(ch.get("axes_hint") or ""),
            series_keys=[str(x) for x in (ch.get("series_keys") or []) if x is not None],
        )
    return ChartRecommendationTrace(
        chart_type=result.chart_type or "line",
        rationale=result.chart_hint or "",
        alternatives=[],
        confidence=0.0,
        axes_hint="",
        series_keys=[],
    )


def _forecast_selection(ft: dict[str, Any]) -> ForecastSelectionTrace:
    selected = ft.get("forecast_selection")
    if not isinstance(selected, dict):
        return ForecastSelectionTrace()
    return ForecastSelectionTrace(
        metric_key=str(selected.get("metric_key")) if selected.get("metric_key") else None,
        selected_strategy=str(selected.get("selected_strategy")) if selected.get("selected_strategy") else None,
        backtest_summary=dict(selected.get("backtest_summary") or {}),
        data_quality=dict(selected.get("data_quality") or {}),
    )


def _guardrails_trace(ft: dict[str, Any]) -> GuardrailsTrace:
    g = ft.get("guardrails")
    if not isinstance(g, dict):
        return GuardrailsTrace()
    msgs = g.get("messages_ru")
    codes = g.get("codes")
    return GuardrailsTrace(
        blocked=bool(g.get("blocked")),
        codes=[str(x) for x in codes] if isinstance(codes, list) else [],
        messages_ru=[str(x) for x in msgs] if isinstance(msgs, list) else [],
    )


def _quality_gate(result: NaturalLanguageAnalysisResult, ft: dict[str, Any]) -> QualityGateTrace:
    gate = ft.get("quality_gate")
    if isinstance(gate, dict):
        status = str(gate.get("status") or "passed")
        if status not in {"passed", "warning", "failed"}:
            status = "warning"
        return QualityGateTrace(status=status, reasons=[str(x) for x in gate.get("reasons") or []])
    reasons: list[str] = []
    if result.execution_status != "succeeded":
        reasons.append("execution_not_succeeded")
    if result.clarification_required:
        reasons.append("clarification_required")
    if result.warnings:
        reasons.append("validation_warnings_present")
    status = "failed" if result.execution_status == "failed" else ("warning" if reasons else "passed")
    return QualityGateTrace(status=status, reasons=reasons)


def build_explainability_trace_v1(result: NaturalLanguageAnalysisResult) -> AnalyticsExplainabilityTraceV1:
    ft: dict[str, Any] = dict(result.full_trace or {})
    fe_raw = ft.get("forecast_explainability")
    forecast_explainability: dict[str, Any] = dict(fe_raw) if isinstance(fe_raw, dict) else {}
    dialogue = result.dialogue if isinstance(result.dialogue, dict) else {}
    sg = ft.get("sql_generation")
    sql_gen = sg if isinstance(sg, dict) else {}
    learned = sql_gen.get("source") == "learned_correction" or bool(result.applied_correction_id)
    entities = ft.get("entities")
    if not isinstance(entities, dict):
        entities = {}
    ht_raw = ft.get("human_trace")
    human_trace_v1: dict[str, Any] = dict(ht_raw) if isinstance(ht_raw, dict) else {}
    return AnalyticsExplainabilityTraceV1(
        language_detected=str(ft.get("language_detected") or "ru"),
        role_policy_result_ru=str(ft.get("role_policy_result_ru") or ""),
        interpreted_intent=_interpreted_intent_line(result, ft),
        structured_interpretation=dict(ft.get("structured_interpretation") or {}),
        interpretation_summary_ru=str(ft.get("interpretation_summary_ru") or ""),
        interpretation_notes=[str(x) for x in (ft.get("interpretation_notes") or []) if x is not None],
        sql_guardrails=dict((ft.get("sql_validation") or {}).get("guardrail_explainability") or {}),
        extracted_entities=entities,
        semantic_terms=_semantic_terms_from_trace(ft),
        tables_used=list(result.used_tables),
        result_columns=list(result.used_columns),
        generated_sql=_generated_sql(ft, result),
        validation_status=_validation_status(result),
        warnings=list(result.warnings),
        confidence=_coerce_unit_interval(result.confidence, default=0.0),
        clarification_requested=bool(result.clarification_required),
        clarification_reason=str(result.clarification_reason or ""),
        clarification_reason_summary_ru=str(
            result.clarification_reason_summary_ru or clarification_reason_summary_ru(result.clarification_reason)
        ),
        clarification_question=str(result.clarification_question or ""),
        follow_up_context_used=bool(dialogue.get("is_followup")),
        learned_correction_used=bool(learned),
        chart_recommendation=_chart_rec(result, ft),
        forecast_mode=_forecast_mode(ft, result),
        forecast_selection=_forecast_selection(ft),
        forecast_explainability=forecast_explainability,
        quality_gate=_quality_gate(result, ft),
        execution_phases=build_execution_phases(result, ft),
        guardrails=_guardrails_trace(ft),
        human_trace=human_trace_v1,
    )


def _resolve_orchestrator(db_session: Optional[Session]) -> QueryOrchestrator:
    if db_session is None:
        return build_default_orchestrator()
    return build_orchestrator_with_learning(db_session)


def analyze_natural_language(
    prompt: str,
    *,
    notebook_context: Optional[dict[str, Any]] = None,
    workspace_id: Optional[str] = None,
    role_key: Optional[str] = None,
    user_id: Optional[str] = None,
    db_session: Optional[Session] = None,
    force_fresh_dialogue: bool = False,
    skip_learned_corrections: bool = False,
    forecast_sidecar: Literal["auto", "on", "off"] = "auto",
    chart_type_override: Optional[str] = None,
    forecast_horizon_steps: Optional[int] = None,
) -> NaturalLanguageAnalysisResult:
    ctx = enrich_notebook_context_for_orchestration(notebook_context)
    resolved_horizon = forecast_horizon_steps
    if resolved_horizon is None:
        resolved_horizon = _optional_forecast_horizon(ctx.get("forecast_horizon_steps"))
    inp = OrchestrationInput(
        raw_query=prompt,
        notebook_context=ctx,
        workspace_id=workspace_id,
        role_key=role_key,
        user_id=user_id,
        force_fresh_dialogue=force_fresh_dialogue,
        skip_learned_corrections=skip_learned_corrections,
        forecast_sidecar=forecast_sidecar,
        chart_type_override=chart_type_override,
        forecast_horizon_steps=resolved_horizon,
    )
    try:
        out = _resolve_orchestrator(db_session).run(inp)
    except Exception as exc:  # noqa: BLE001
        logger.exception("orchestration_run_failed prompt_prefix=%s", (prompt or "")[:120])
        err = str(exc)[:400]
        return NaturalLanguageAnalysisResult(
            prompt=prompt,
            safe_sql="",
            table_records=[],
            chart_hint="",
            chart_type="table",
            insight=f"Ошибка оркестрации: {err}",
            forecast_records=[],
            trace_summary=f"status=failed error={type(exc).__name__}",
            confidence=0.0,
            warnings=[f"orchestration_error: {err}"],
            used_tables=[],
            used_columns=[],
            parsed={"intent": "error", "metric": "", "is_follow_up": "False", "sql_generation_source": "none"},
            full_trace={
                "intent": "error",
                "pipeline_steps": [{"name": "orchestration", "ok": False, "detail": {"error": err}}],
                "quality_gate": {"status": "failed", "reasons": ["orchestration_exception"]},
                "entities": {},
                "semantic_terms": [],
                "forecast_mode": {"active": False, "method": None},
                "forecast_selection": {},
                "forecast_explainability": {},
            },
            execution_status="failed",
            clarification_required=False,
            clarification_reason="",
            clarification_reason_summary_ru="",
            clarification_question="",
            clarification_options=[],
            dialogue={},
            visualization={},
            sql_generation_source="none",
            resolved_source_table=str(settings.ds_default_source_table),
        )

    warnings = list(out.validation_warnings)
    if settings.mock_mode:
        warnings.append("Mock fallback active: PostgreSQL execution is stubbed.")
    elif any("MOCK_SQL_EXECUTION_FALLBACK=true" in str(w) for w in warnings):
        warnings.append("Выполнение SQL: ошибка Postgres, показаны stub-строки (MOCK_SQL_EXECUTION_FALLBACK).")
    if out.ambiguity.required and out.ambiguity.question:
        warnings.append(f"Ambiguity: {out.ambiguity.question}")

    clar = out.clarification
    clarification_required = bool(clar and clar.clarification_required)
    clarification_reason = clar.clarification_reason if clar else ""
    clarification_question = clar.clarification_question if clar else ""
    clarification_options = [o.model_dump() for o in clar.clarification_options] if clar else []
    if clarification_required:
        warnings.append("Требуется уточнение: выполнение SQL отложено.")

    safe_sql = (
        ""
        if clarification_required
        else (out.validated_sql or out.generated_sql)
    )
    ft0: dict[str, Any] = dict(out.trace_payload or {})
    if not out.semantic_resolutions and bool(ft0.get("general_conversation")):
        metric_key = "conversation"
    else:
        metric_key = out.semantic_resolutions[0].term_key if out.semantic_resolutions else ""
        if not metric_key:
            metric_key = "orders_count"
    trace_summary = (
        f"Intent={out.intent}, metric={metric_key}, follow_up={out.is_follow_up}, "
        f"status={out.execution_status}"
    )

    sql_blob = (out.validated_sql or out.generated_sql or "")
    used_tables: list[str] = _extract_tables_from_sql(sql_blob)
    if clarification_required and not used_tables:
        used_tables = _extract_tables_from_sql(settings.ds_default_source_table) or [settings.ds_default_source_table]

    dialogue_api = out.dialogue.to_api_dict() if out.dialogue else {}

    parsed = {
        "intent": out.intent,
        "metric": metric_key,
        "is_follow_up": str(out.is_follow_up),
        "sql_generation_source": out.sql_generation_source,
    }

    resolved_src = str(ctx.get("source_table") or settings.ds_default_source_table).strip()

    return NaturalLanguageAnalysisResult(
        prompt=prompt,
        safe_sql=safe_sql,
        table_records=list(out.result_preview),
        chart_hint=out.chart.rationale,
        chart_type=out.chart.chart_type,
        insight=out.insight_text,
        forecast_records=list(out.forecast_records),
        trace_summary=trace_summary,
        confidence=_coerce_unit_interval(out.confidence_score, default=0.82),
        warnings=warnings,
        used_tables=used_tables,
        used_columns=list(out.result_columns),
        parsed=parsed,
        full_trace=dict(out.trace_payload),
        execution_status=out.execution_status,
        clarification_required=clarification_required,
        clarification_reason=clarification_reason,
        clarification_reason_summary_ru=clarification_reason_summary_ru(clarification_reason),
        clarification_question=clarification_question,
        clarification_options=clarification_options,
        dialogue=dialogue_api,
        visualization=dict(out.visualization.model_dump()) if out.visualization else {},
        sql_generation_source=out.sql_generation_source,
        applied_correction_id=str(out.applied_correction_id) if out.applied_correction_id else None,
        correction_similarity=out.correction_similarity,
        correction_match_kind=out.correction_match_kind,
        resolved_source_table=resolved_src,
    )


def _build_forecast_cell_payload(result: NaturalLanguageAnalysisResult) -> dict[str, Any]:
    """Структурированная ячейка прогноза: baseline + метаданные для UI (честный уровень)."""
    ft: dict[str, Any] = dict(result.full_trace or {})
    raw_explain = ft.get("forecast_explainability")
    explain: dict[str, Any] = dict(raw_explain) if isinstance(raw_explain, dict) else {}
    records = list(result.forecast_records or [])
    h = int(explain.get("horizon_steps") or len(records) or 0)
    horizon_label = f"Следующие {h} шаг(ов) ряда" if h else "Горизонт не задан"
    last = records[-1] if records else {}
    parts: list[str] = []
    if explain.get("warning_ru"):
        parts.append(str(explain["warning_ru"]))
    if explain.get("r_squared") is not None:
        parts.append(f"R²≈{explain['r_squared']}")
    if explain.get("confidence_score") is not None:
        try:
            cs = float(explain["confidence_score"])
            parts.append(f"Уверенность (эвристика): {cs:.0%}")
        except (TypeError, ValueError):
            pass
    subtext = " · ".join(parts) if parts else None
    headline = str(explain.get("method_label_ru") or "Baseline-прогноз по ряду (7d MVP)")
    mvp_note = (
        "MVP: линейный baseline по историческому ряду, не production-ML; горизонт и качество зависят от полноты данных."
    )
    subtext_final = " · ".join([x for x in (subtext, mvp_note) if x])
    return {
        "schema_version": 1,
        "headline": headline,
        "subtext": subtext_final,
        "horizon": horizon_label,
        "baseline": last.get("forecast_value"),
        "pessimistic": last.get("forecast_low"),
        "optimistic": last.get("forecast_high"),
        "records": records,
        "explanation_ru": explain.get("explanation_ru"),
        "warning_ru": explain.get("warning_ru"),
        "confidence_score": explain.get("confidence_score"),
        "history": explain.get("history") or [],
        "r_squared": explain.get("r_squared"),
        "metric_column": explain.get("metric_column"),
        "backtest_note_ru": explain.get("backtest_note_ru"),
        "time_grain": explain.get("time_grain"),
        "source_table_label": explain.get("source_table_label"),
        "combined_series": explain.get("combined_series") or [],
    }


def _result_to_pipeline_cells(result: NaturalLanguageAnalysisResult) -> list[PipelineCellItem]:
    explain_v1 = build_explainability_trace_v1(result)
    ft_all: dict[str, Any] = dict(result.full_trace or {})
    trace_payload: dict[str, Any] = {
        "summary": result.trace_summary,
        "interpreted_intent": str(ft_all.get("intent") or (result.parsed or {}).get("intent") or ""),
        "confidence": _coerce_unit_interval(result.confidence, default=0.0),
        "warnings": list(result.warnings or []),
        "tables_used": list(result.used_tables or []),
        "explainability": explain_v1.model_dump(mode="json"),
        "interpretation": ft_all.get("interpretation") or {},
        "trace": ft_all.get("trace") or [],
    }
    if result.clarification_required:
        opts_in = list(result.clarification_options or [])
        ui_opts: list[dict[str, str]] = []
        for o in opts_in:
            if not isinstance(o, dict):
                continue
            val = str(o.get("value") or o.get("id") or "").strip()
            lab = str(o.get("label") or "").strip()
            if lab:
                ui_opts.append({"id": val or lab, "label": lab})
        reason_ru = (result.clarification_reason_summary_ru or "").strip() or clarification_reason_summary_ru(
            result.clarification_reason
        )
        clar_payload = {
            "prompt": (result.clarification_question or "Нужно уточнение по запросу.").strip(),
            "reason_code": result.clarification_reason,
            "reason_summary_ru": reason_ru,
            "options": ui_opts,
        }
        return [
            PipelineCellItem(id=str(uuid4()), type="prompt", content=result.prompt),
            PipelineCellItem(
                id=str(uuid4()),
                type="trace",
                content=result.trace_summary,
                payload=trace_payload,
            ),
            PipelineCellItem(
                id=str(uuid4()),
                type="clarification",
                content=json.dumps(clar_payload, ensure_ascii=False),
                payload=clar_payload,
            ),
        ]

    chart_payload = _build_chart_cell_payload(result)
    table_rows = list(result.table_records or [])
    table_columns = list(table_rows[0].keys()) if table_rows else []
    table_payload = {
        "columns": table_columns,
        "rows": table_rows,
        "caption": "Результат SQL-запроса",
    }
    return [
        PipelineCellItem(id=str(uuid4()), type="prompt", content=result.prompt),
        PipelineCellItem(
            id=str(uuid4()),
            type="trace",
            content=result.trace_summary,
            payload=trace_payload,
        ),
        PipelineCellItem(id=str(uuid4()), type="sql", content=result.safe_sql),
        PipelineCellItem(
            id=str(uuid4()),
            type="table",
            content=json.dumps(table_payload, ensure_ascii=False, default=str),
            payload=table_payload,
        ),
        PipelineCellItem(
            id=str(uuid4()),
            type="chart",
            content=json.dumps(chart_payload, ensure_ascii=False, default=str),
            payload=chart_payload,
        ),
        PipelineCellItem(id=str(uuid4()), type="insight", content=result.insight),
        PipelineCellItem(
            id=str(uuid4()),
            type="forecast",
            content=json.dumps(_build_forecast_cell_payload(result), ensure_ascii=False, default=str),
        ),
    ]


def _is_number(value: Any) -> bool:
    if isinstance(value, bool) or value is None:
        return False
    if isinstance(value, (int, float)):
        return True
    if isinstance(value, str):
        s = value.strip().replace(",", ".")
        if not s:
            return False
        try:
            float(s)
            return True
        except ValueError:
            return False
    return False


def _as_float(value: Any) -> Optional[float]:
    if not _is_number(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip().replace(",", "."))
    except (TypeError, ValueError):
        return None


def _pick_numeric_columns(rows: list[dict[str, Any]], columns: list[str]) -> list[str]:
    out: list[str] = []
    sample = rows[:40]
    for c in columns:
        present = 0
        numeric = 0
        for row in sample:
            if c not in row:
                continue
            present += 1
            if _is_number(row.get(c)):
                numeric += 1
        if present > 0 and numeric / present >= 0.7:
            out.append(c)
    return out


def _pick_dimension_column(columns: list[str], numeric_cols: list[str]) -> Optional[str]:
    """Категориальная ось; если все колонки числовые (типично только `value`) — None (нужен синтетический label)."""
    for c in columns:
        if c not in numeric_cols:
            return c
    return None


def _sql_metric_column_display_name(column: str) -> str:
    """Короткие подписи для «широкой» строки с несколькими COUNT — ось категорий на графике."""
    lo = column.lower()
    if "accept" in lo or "принят" in lo:
        return "Принятые заказы"
    if "cancel" in lo or "отмен" in lo:
        return "Отменённые заказы"
    if "done" in lo or "заверш" in lo:
        return "Завершённые поездки"
    if "price" in lo or "revenue" in lo or "выруч" in lo:
        return "Сумма / выручка"
    return column.replace("_", " ")


def _try_melt_single_row_all_numeric_bar_payload(
    chart_type: str,
    rows: list[dict[str, Any]],
    columns: list[str],
    numeric_cols: list[str],
    *,
    recommended: str,
    alternatives: list[str],
    explanation: str,
    geo_metadata: Optional[dict[str, Any]],
    sample_size: int,
    unit_label: str,
    quality_metric_label: str,
    quality_metric_value: Optional[float],
) -> Optional[dict[str, Any]]:
    """Одна строка, только числовые колонки: bar/horizontal_bar как несколько категорий, не ось X = первое число."""
    if chart_type not in {"bar", "horizontal_bar"}:
        return None
    if len(rows) != 1 or len(numeric_cols) < 2:
        return None
    if any(c not in numeric_cols for c in columns):
        return None
    label_key = "_metric_label"
    value_key = "_metric_value"
    row0 = rows[0]
    data: list[dict[str, Any]] = []
    for c in numeric_cols:
        v = _as_float(row0.get(c))
        data.append(
            {
                label_key: _sql_metric_column_display_name(c),
                value_key: v if v is not None else row0.get(c),
            }
        )
    return {
        "chartType": chart_type,
        "recommendedChartType": recommended,
        "alternativeChartTypes": alternatives,
        "visualizationExplanation": explanation,
        "geoMetadata": geo_metadata,
        "title": "Сравнение показателей",
        "subtitle": f"Период и фильтры из запроса; выборка n={sample_size}",
        "unitLabel": unit_label,
        "sampleSize": sample_size,
        "qualityMetricLabel": quality_metric_label,
        "qualityMetricValue": quality_metric_value,
        "xKey": label_key,
        "series": [{"key": value_key, "name": "Значение"}],
        "data": data,
    }


def _build_histogram_data(rows: list[dict[str, Any]], col: str) -> list[dict[str, Any]]:
    values = [_as_float(row.get(col)) for row in rows]
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return []
    vmin = min(vals)
    vmax = max(vals)
    if vmin == vmax:
        return [{"bucket": f"{vmin:.2f}", "count": len(vals)}]
    bins = max(5, min(10, int(len(vals) ** 0.5)))
    width = (vmax - vmin) / bins
    counts = [0 for _ in range(bins)]
    for v in vals:
        idx = min(int((v - vmin) / width), bins - 1)
        counts[idx] += 1
    out: list[dict[str, Any]] = []
    for idx, cnt in enumerate(counts):
        left = vmin + idx * width
        right = left + width
        out.append({"bucket": f"{left:.1f}–{right:.1f}", "count": cnt})
    return out


def _geo_metadata_api_payload(raw: dict[str, Any]) -> dict[str, Any]:
    feats_in = raw.get("map_features") or []
    map_features: list[dict[str, Any]] = []
    if isinstance(feats_in, list):
        for f in feats_in:
            if not isinstance(f, dict):
                continue
            lat_v, lon_v = f.get("lat"), f.get("lon")
            map_features.append(
                {
                    "id": str(f.get("id", "") or ""),
                    "label": str(f.get("label", "") or ""),
                    "value": f.get("value") if isinstance(f.get("value"), (int, float)) or f.get("value") is None else None,
                    "lat": lat_v if isinstance(lat_v, (int, float)) or lat_v is None else None,
                    "lon": lon_v if isinstance(lon_v, (int, float)) or lon_v is None else None,
                }
            )
    return {
        "geoEnabled": bool(raw.get("geo_enabled")),
        "geoDimension": raw.get("geo_dimension"),
        "mapScope": raw.get("map_scope"),
        "fallbackChartType": raw.get("fallback_chart_type"),
        "mapFeatures": map_features,
    }


def _build_chart_cell_payload(result: NaturalLanguageAnalysisResult) -> dict[str, Any]:
    viz = dict(result.visualization or {})
    recommended = str(viz.get("recommended_chart_type") or result.chart_type or "bar").lower()
    alternatives = [str(x).lower() for x in (viz.get("alternative_chart_types") or []) if x is not None]
    explanation = str(viz.get("visualization_explanation") or viz.get("recommendation_reason") or result.chart_hint or "")
    geo_metadata_raw = viz.get("geo_metadata") if isinstance(viz.get("geo_metadata"), dict) else None
    geo_metadata = _geo_metadata_api_payload(geo_metadata_raw) if geo_metadata_raw else None

    rows = list(result.table_records or [])
    sample_size = len(rows)
    unit_label = "шт."
    lowered_cols = [str(c).lower() for c in (rows[0].keys() if rows else [])]
    if any("price" in c or "revenue" in c or "rub" in c for c in lowered_cols):
        unit_label = "RUB"
    elif any("rate" in c or "share" in c or "%" in c for c in lowered_cols):
        unit_label = "%"
    quality_metric_value = float(result.confidence) if result.confidence is not None else None
    quality_metric_label = "Confidence"
    if not rows:
        return {
            "chartType": "table",
            "recommendedChartType": recommended,
            "alternativeChartTypes": alternatives,
            "visualizationExplanation": explanation or "Недостаточно данных для графика, показана таблица.",
            "geoMetadata": geo_metadata,
            "title": "Визуализация результата",
            "subtitle": "Нет данных для визуализации",
            "unitLabel": unit_label,
            "sampleSize": sample_size,
            "qualityMetricLabel": quality_metric_label,
            "qualityMetricValue": quality_metric_value,
            "xKey": "label",
            "series": [{"key": "value", "name": "Значение"}],
            "data": [],
        }

    columns = list(rows[0].keys())
    numeric_cols = _pick_numeric_columns(rows, columns)
    dim_col = _pick_dimension_column(columns, numeric_cols)
    # Один числовой столбец без измерения (SUM/COUNT AS value): иначе xKey и серия совпадают → пустой график в UI.
    if len(columns) == 1 and len(numeric_cols) == 1:
        metric_key = numeric_cols[0]
        cat_key = "_aggregate_label"
        data_scalar: list[dict[str, Any]] = []
        if len(rows) == 1:
            raw_v = rows[0].get(metric_key)
            v0 = _as_float(raw_v)
            data_scalar.append({cat_key: "Итого", metric_key: v0 if v0 is not None else raw_v})
        else:
            for i, row in enumerate(rows[:60]):
                raw_v = row.get(metric_key)
                v = _as_float(raw_v)
                data_scalar.append({cat_key: f"#{i + 1}", metric_key: v if v is not None else raw_v})
        return {
            "chartType": "horizontal_bar",
            "recommendedChartType": recommended,
            "alternativeChartTypes": alternatives,
            "visualizationExplanation": explanation
            or "Один агрегированный показатель — показан как одна полоса по категории «Итого».",
            "geoMetadata": geo_metadata,
            "title": "Итог по запросу",
            "subtitle": f"Одна метрика ({metric_key}); выборка n={sample_size}",
            "unitLabel": unit_label,
            "sampleSize": sample_size,
            "qualityMetricLabel": quality_metric_label,
            "qualityMetricValue": quality_metric_value,
            "xKey": cat_key,
            "series": [{"key": metric_key, "name": metric_key.replace("_", " ").strip() or "Значение"}],
            "data": data_scalar,
        }
    chart_type = recommended
    supported = {
        "line",
        "bar",
        "area",
        "horizontal_bar",
        "stacked_bar",
        "combo",
        "pie",
        "donut",
        "scatter",
        "radar",
        "heatmap",
        "geo_bubble",
        "map",
        "histogram",
        "table",
    }
    if chart_type not in supported:
        chart_type = "table"

    if chart_type in {"line", "bar", "area", "horizontal_bar", "combo", "stacked_bar", "radar", "geo_bubble", "map"}:
        if chart_type in {"bar", "horizontal_bar"}:
            melted = _try_melt_single_row_all_numeric_bar_payload(
                chart_type,
                rows,
                columns,
                numeric_cols,
                recommended=recommended,
                alternatives=alternatives,
                explanation=explanation,
                geo_metadata=geo_metadata,
                sample_size=sample_size,
                unit_label=unit_label,
                quality_metric_label=quality_metric_label,
                quality_metric_value=quality_metric_value,
            )
            if melted is not None:
                return melted
        x_key = dim_col or columns[0]
        series_cols = numeric_cols[:2] if chart_type == "combo" else numeric_cols[:3]
        series_cols = [c for c in series_cols if c != x_key]
        if not series_cols:
            for c in numeric_cols:
                if c != x_key:
                    series_cols.append(c)
                    break
        if not series_cols and len(columns) > 1:
            series_cols = [columns[1]]
        data: list[dict[str, Any]] = []
        for row in rows[:60]:
            point: dict[str, Any] = {x_key: row.get(x_key)}
            for sc in series_cols:
                v = _as_float(row.get(sc))
                point[sc] = v if v is not None else row.get(sc)
            data.append(point)
        return {
            "chartType": chart_type,
            "recommendedChartType": recommended,
            "alternativeChartTypes": alternatives,
            "visualizationExplanation": explanation,
            "geoMetadata": geo_metadata,
            "title": "Визуализация результата",
            "subtitle": f"Период и фильтры из запроса; выборка n={sample_size}",
            "unitLabel": unit_label,
            "sampleSize": sample_size,
            "qualityMetricLabel": quality_metric_label,
            "qualityMetricValue": quality_metric_value,
            "xKey": x_key,
            "series": [{"key": sc, "name": sc} for sc in series_cols],
            "data": data,
        }

    if chart_type in {"pie", "donut"}:
        label_key = dim_col or columns[0]
        value_key = numeric_cols[0] if numeric_cols else (columns[1] if len(columns) > 1 else columns[0])
        data = []
        for row in rows[:20]:
            value = _as_float(row.get(value_key))
            data.append({label_key: str(row.get(label_key, "—")), value_key: value if value is not None else 0})
        return {
            "chartType": chart_type,
            "recommendedChartType": recommended,
            "alternativeChartTypes": alternatives,
            "visualizationExplanation": explanation,
            "geoMetadata": geo_metadata,
            "title": "Структура показателя",
            "subtitle": f"Период и фильтры из запроса; выборка n={sample_size}",
            "unitLabel": unit_label,
            "sampleSize": sample_size,
            "qualityMetricLabel": quality_metric_label,
            "qualityMetricValue": quality_metric_value,
            "xKey": label_key,
            "series": [{"key": value_key, "name": value_key}],
            "data": data,
        }

    if chart_type == "scatter":
        if len(numeric_cols) >= 2:
            x_key, y_key = numeric_cols[0], numeric_cols[1]
            data = []
            for row in rows[:80]:
                xv = _as_float(row.get(x_key))
                yv = _as_float(row.get(y_key))
                if xv is None or yv is None:
                    continue
                data.append({x_key: xv, y_key: yv})
            if data:
                return {
                    "chartType": "scatter",
                    "recommendedChartType": recommended,
                    "alternativeChartTypes": alternatives,
                    "visualizationExplanation": explanation,
                    "geoMetadata": geo_metadata,
                    "title": "Связь метрик",
                    "subtitle": f"Период и фильтры из запроса; выборка n={sample_size}",
                    "unitLabel": unit_label,
                    "sampleSize": sample_size,
                    "qualityMetricLabel": quality_metric_label,
                    "qualityMetricValue": quality_metric_value,
                    "xKey": x_key,
                    "series": [{"key": y_key, "name": y_key}],
                    "data": data,
                }
        chart_type = "table"
        explanation = f"{explanation} Табличный fallback: для scatter нужны ≥2 числовых колонок.".strip()

    if chart_type in {"histogram", "heatmap"}:
        metric = numeric_cols[0] if numeric_cols else None
        if metric:
            data = _build_histogram_data(rows, metric)
            return {
                "chartType": "heatmap" if chart_type == "heatmap" else "histogram",
                "recommendedChartType": recommended,
                "alternativeChartTypes": alternatives,
                "visualizationExplanation": explanation,
                "geoMetadata": geo_metadata,
                "title": f"Распределение: {metric}",
                "subtitle": f"Период и фильтры из запроса; выборка n={sample_size}",
                "unitLabel": unit_label,
                "sampleSize": sample_size,
                "qualityMetricLabel": quality_metric_label,
                "qualityMetricValue": quality_metric_value,
                "xKey": "bucket",
                "series": [{"key": "count", "name": "count"}],
                "data": data,
            }
        chart_type = "table"
        explanation = f"{explanation} Табличный fallback: не удалось построить гистограмму/heatmap.".strip()

    if chart_type == "table":
        return {
            "chartType": "table",
            "recommendedChartType": recommended,
            "alternativeChartTypes": alternatives,
            "visualizationExplanation": explanation,
            "geoMetadata": geo_metadata,
            "title": "Табличный fallback",
            "subtitle": f"Период и фильтры из запроса; выборка n={sample_size}",
            "unitLabel": unit_label,
            "sampleSize": sample_size,
            "qualityMetricLabel": quality_metric_label,
            "qualityMetricValue": quality_metric_value,
            "xKey": columns[0],
            "series": [{"key": c, "name": c} for c in columns[1:2]],
            "data": rows[:60],
        }

    # Табличный safe fallback (вместо неподдерживаемого bar).
    return {
        "chartType": "table",
        "recommendedChartType": recommended,
        "alternativeChartTypes": alternatives,
        "visualizationExplanation": f"{explanation} Табличный fallback: тип «{recommended}» не удалось отрисовать надёжно.".strip(),
        "geoMetadata": geo_metadata,
        "title": "Табличный fallback",
        "subtitle": f"Период и фильтры из запроса; выборка n={sample_size}",
        "unitLabel": unit_label,
        "sampleSize": sample_size,
        "qualityMetricLabel": quality_metric_label,
        "qualityMetricValue": quality_metric_value,
        "xKey": columns[0],
        "series": [{"key": c, "name": c} for c in (columns[1:3] if len(columns) > 1 else columns[:1])],
        "data": rows[:60],
    }


MOCK_NOTEBOOK_CELLS: dict[str, list[PipelineCellItem]] = {}


def _build_notebook_context_from_cells(notebook_id: str) -> dict[str, Any]:
    prev = MOCK_NOTEBOOK_CELLS.get(notebook_id, [])
    if not prev:
        return {}
    last_prompt = ""
    for cell in reversed(prev):
        if cell.type == "prompt" and cell.content.strip():
            last_prompt = cell.content.strip()
            break
    if not last_prompt:
        return {}
    return {
        "last_user_query": last_prompt,
        "dialogue_turn": len([c for c in prev if c.type == "prompt"]),
    }


def run_pipeline_with_analysis(
    notebook_id: str,
    prompt: str,
    *,
    role_key: str | None = None,
    result_limit: int | None = None,
    result_offset: int | None = None,
    force_fresh_dialogue: bool = False,
    skip_learned_corrections: bool = False,
    forecast_sidecar: Literal["auto", "on", "off"] = "auto",
    chart_type_override: str | None = None,
    forecast_horizon_steps: int | None = None,
) -> tuple[RunAnalyticsResponse, NaturalLanguageAnalysisResult]:
    """То же, что run_pipeline, плюс объект анализа для записи в БД (история / ячейки ноутбука)."""
    result = analyze_natural_language(
        prompt,
        notebook_context=_build_notebook_context_from_cells(notebook_id),
        role_key=role_key,
        force_fresh_dialogue=force_fresh_dialogue,
        skip_learned_corrections=skip_learned_corrections,
        forecast_sidecar=forecast_sidecar,
        chart_type_override=chart_type_override,
        forecast_horizon_steps=forecast_horizon_steps,
    )
    if result_limit is not None:
        rows = list(result.table_records)
        off = max(0, int(result_offset or 0))
        end = min(len(rows), off + int(result_limit))
        slice_rows = rows[off:end]
        pag_msg = (
            f"Пагинация результата: показаны строки {off}–{end} из {len(rows)} "
            "(см. параметры result_limit / result_offset)."
        )
        result = replace(
            result,
            table_records=slice_rows,
            warnings=list(result.warnings) + [pag_msg],
        )
    cells = _result_to_pipeline_cells(result)
    trace = build_explainability_trace_v1(result)
    chart_payload = _build_chart_cell_payload(result)
    table_rows = list(result.table_records or [])
    table_columns = list(table_rows[0].keys()) if table_rows else []
    post = post_process_sql_result(table_rows, table_columns)
    resp = RunAnalyticsResponse(
        notebook_id=notebook_id,
        cells=cells,
        trace=trace,
        question=result.prompt,
        interpreted_query=trace.interpreted_intent,
        safe_sql=result.safe_sql,
        table={
            "columns": table_columns,
            "rows": table_rows,
            "caption": "Результат SQL-запроса",
        },
        chart=chart_payload,
        insight=result.insight,
        confidence=_coerce_unit_interval(result.confidence, default=0.0),
        insights=list(post.get("insights") or []),
        forecast=dict(post.get("forecast") or {}),
        anomalies=list(post.get("anomalies") or []),
        resolved_source_table=str(getattr(result, "resolved_source_table", "") or "").strip()
        or str(settings.ds_default_source_table),
    )
    return resp, result


def run_pipeline(
    notebook_id: str,
    prompt: str,
    *,
    role_key: str | None = None,
    result_limit: int | None = None,
    result_offset: int | None = None,
    force_fresh_dialogue: bool = False,
    skip_learned_corrections: bool = False,
    forecast_sidecar: Literal["auto", "on", "off"] = "auto",
    chart_type_override: str | None = None,
    forecast_horizon_steps: int | None = None,
) -> RunAnalyticsResponse:
    resp, _result = run_pipeline_with_analysis(
        notebook_id,
        prompt,
        role_key=role_key,
        result_limit=result_limit,
        result_offset=result_offset,
        force_fresh_dialogue=force_fresh_dialogue,
        skip_learned_corrections=skip_learned_corrections,
        forecast_sidecar=forecast_sidecar,
        chart_type_override=chart_type_override,
        forecast_horizon_steps=forecast_horizon_steps,
    )
    prev = MOCK_NOTEBOOK_CELLS.get(notebook_id, [])
    MOCK_NOTEBOOK_CELLS[notebook_id] = prev + resp.cells
    return resp


def list_mock_notebooks() -> list[dict[str, object]]:
    now = datetime.now(timezone.utc)
    return [
        {
            "id": "nbk-demo-1",
            "title": "Weekly GMV and Region Dynamics",
            "role": "manager",
            "createdAt": now,
            "cells": MOCK_NOTEBOOK_CELLS.get("nbk-demo-1", []),
        }
    ]
