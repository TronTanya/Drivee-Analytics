from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from typing import Any, Optional
from uuid import uuid4

import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import settings
from app.schemas.analytics import RunAnalyticsResponse
from app.schemas.orchestration import OrchestrationInput
from app.schemas.trace_payload import (
    AnalyticsExplainabilityTraceV1,
    ChartRecommendationTrace,
    ForecastSelectionTrace,
    ForecastModeTrace,
    QualityGateTrace,
    SemanticTermTraceItem,
    ValidationStatusLiteral,
)
from app.schemas.pipeline import PipelineCellItem
from app.services.orchestration.query_orchestrator import (
    QueryOrchestrator,
    build_default_orchestrator,
    build_orchestrator_with_learning,
)


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
    clarification_question: str = ""
    clarification_options: list[dict[str, str]] = field(default_factory=list)
    dialogue: dict[str, Any] = field(default_factory=dict)
    visualization: dict[str, Any] = field(default_factory=dict)
    sql_generation_source: str = "default_template"
    applied_correction_id: Optional[str] = None
    correction_similarity: Optional[float] = None
    correction_match_kind: Optional[str] = None


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
            return ForecastModeTrace(active=True, method=method_str or "linear_trend_ols")
        return ForecastModeTrace(active=active, method=method_str)
    if result.forecast_records:
        return ForecastModeTrace(active=True, method="linear_trend_ols")
    return ForecastModeTrace()


def _chart_rec(result: NaturalLanguageAnalysisResult, ft: dict[str, Any]) -> ChartRecommendationTrace:
    ch = ft.get("chart")
    if isinstance(ch, dict):
        return ChartRecommendationTrace(
            chart_type=str(ch.get("chart_type") or result.chart_type or "line"),
            rationale=str(ch.get("rationale") or result.chart_hint or ""),
            alternatives=[str(x) for x in (ch.get("alternatives") or []) if x is not None],
        )
    return ChartRecommendationTrace(
        chart_type=result.chart_type or "line",
        rationale=result.chart_hint or "",
        alternatives=[],
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
    dialogue = result.dialogue if isinstance(result.dialogue, dict) else {}
    sg = ft.get("sql_generation")
    sql_gen = sg if isinstance(sg, dict) else {}
    learned = sql_gen.get("source") == "learned_correction" or bool(result.applied_correction_id)
    entities = ft.get("entities")
    if not isinstance(entities, dict):
        entities = {}
    return AnalyticsExplainabilityTraceV1(
        interpreted_intent=_interpreted_intent_line(result, ft),
        extracted_entities=entities,
        semantic_terms=_semantic_terms_from_trace(ft),
        tables_used=list(result.used_tables),
        result_columns=list(result.used_columns),
        generated_sql=_generated_sql(ft, result),
        validation_status=_validation_status(result),
        warnings=list(result.warnings),
        confidence=float(result.confidence),
        clarification_requested=bool(result.clarification_required),
        follow_up_context_used=bool(dialogue.get("is_followup")),
        learned_correction_used=bool(learned),
        chart_recommendation=_chart_rec(result, ft),
        forecast_mode=_forecast_mode(ft, result),
        forecast_selection=_forecast_selection(ft),
        quality_gate=_quality_gate(result, ft),
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
    db_session: Optional[Session] = None,
) -> NaturalLanguageAnalysisResult:
    inp = OrchestrationInput(
        raw_query=prompt,
        notebook_context=dict(notebook_context or {}),
        workspace_id=workspace_id,
        role_key=role_key,
    )
    out = _resolve_orchestrator(db_session).run(inp)

    warnings = list(out.validation_warnings)
    if settings.mock_mode:
        warnings.append("Mock fallback active: PostgreSQL execution is stubbed.")
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
    metric_key = out.semantic_resolutions[0].term_key if out.semantic_resolutions else "orders_count"
    trace_summary = (
        f"Intent={out.intent}, metric={metric_key}, follow_up={out.is_follow_up}, "
        f"status={out.execution_status}"
    )

    sql_blob = (out.validated_sql or out.generated_sql or "").lower()
    used_tables: list[str] = []
    if clarification_required:
        used_tables = ["anonymized_incity_orders"]
    elif sql_blob:
        used_tables = ["anonymized_incity_orders"]

    dialogue_api = out.dialogue.to_api_dict() if out.dialogue else {}

    parsed = {
        "intent": out.intent,
        "metric": metric_key,
        "is_follow_up": str(out.is_follow_up),
        "sql_generation_source": out.sql_generation_source,
    }

    return NaturalLanguageAnalysisResult(
        prompt=prompt,
        safe_sql=safe_sql,
        table_records=list(out.result_preview),
        chart_hint=out.chart.rationale,
        chart_type=out.chart.chart_type,
        insight=out.insight_text,
        forecast_records=list(out.forecast_records),
        trace_summary=trace_summary,
        confidence=out.confidence_score,
        warnings=warnings,
        used_tables=used_tables,
        used_columns=list(out.result_columns),
        parsed=parsed,
        full_trace=dict(out.trace_payload),
        execution_status=out.execution_status,
        clarification_required=clarification_required,
        clarification_reason=clarification_reason,
        clarification_question=clarification_question,
        clarification_options=clarification_options,
        dialogue=dialogue_api,
        visualization=dict(out.visualization.model_dump()) if out.visualization else {},
        sql_generation_source=out.sql_generation_source,
        applied_correction_id=str(out.applied_correction_id) if out.applied_correction_id else None,
        correction_similarity=out.correction_similarity,
        correction_match_kind=out.correction_match_kind,
    )


def _result_to_pipeline_cells(result: NaturalLanguageAnalysisResult) -> list[PipelineCellItem]:
    chart_payload = _build_chart_cell_payload(result)
    return [
        PipelineCellItem(id=str(uuid4()), type="prompt", content=result.prompt),
        PipelineCellItem(id=str(uuid4()), type="trace", content=result.trace_summary),
        PipelineCellItem(id=str(uuid4()), type="sql", content=result.safe_sql),
        PipelineCellItem(id=str(uuid4()), type="table", content=pd.DataFrame(result.table_records).to_json(orient="records", date_format="iso")),
        PipelineCellItem(id=str(uuid4()), type="chart", content=json.dumps(chart_payload, ensure_ascii=False)),
        PipelineCellItem(id=str(uuid4()), type="insight", content=result.insight),
        PipelineCellItem(id=str(uuid4()), type="forecast", content=pd.DataFrame(result.forecast_records).to_json(orient="records")),
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
    for c in columns:
        if c not in numeric_cols:
            return c
    return columns[0] if columns else None


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


def _build_chart_cell_payload(result: NaturalLanguageAnalysisResult) -> dict[str, Any]:
    viz = dict(result.visualization or {})
    recommended = str(viz.get("recommended_chart_type") or result.chart_type or "bar").lower()
    alternatives = [str(x).lower() for x in (viz.get("alternative_chart_types") or []) if x is not None]
    explanation = str(viz.get("visualization_explanation") or viz.get("recommendation_reason") or result.chart_hint or "")
    geo_metadata_raw = viz.get("geo_metadata") if isinstance(viz.get("geo_metadata"), dict) else None
    geo_metadata = (
        {
            "geoEnabled": bool(geo_metadata_raw.get("geo_enabled")),
            "geoDimension": geo_metadata_raw.get("geo_dimension"),
            "mapScope": geo_metadata_raw.get("map_scope"),
            "fallbackChartType": geo_metadata_raw.get("fallback_chart_type"),
        }
        if geo_metadata_raw
        else None
    )

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
        chart_type = "bar"

    if chart_type in {"line", "bar", "area", "horizontal_bar", "combo", "stacked_bar", "radar", "geo_bubble", "map"}:
        x_key = dim_col or columns[0]
        series_cols = numeric_cols[:2] if chart_type == "combo" else numeric_cols[:3]
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
        chart_type = "bar"

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
        chart_type = "bar"

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

    # safe fallback
    fallback_x = dim_col or columns[0]
    fallback_metric = numeric_cols[0] if numeric_cols else (columns[1] if len(columns) > 1 else columns[0])
    fallback_data: list[dict[str, Any]] = []
    for row in rows[:60]:
        value = _as_float(row.get(fallback_metric))
        fallback_data.append({fallback_x: row.get(fallback_x), fallback_metric: value if value is not None else 0})
    return {
        "chartType": "bar",
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
        "xKey": fallback_x,
        "series": [{"key": fallback_metric, "name": fallback_metric}],
        "data": fallback_data,
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


def run_pipeline(notebook_id: str, prompt: str) -> RunAnalyticsResponse:
    notebook_context = _build_notebook_context_from_cells(notebook_id)
    result = analyze_natural_language(prompt, notebook_context=notebook_context)
    cells = _result_to_pipeline_cells(result)
    prev = MOCK_NOTEBOOK_CELLS.get(notebook_id, [])
    MOCK_NOTEBOOK_CELLS[notebook_id] = prev + cells
    trace = build_explainability_trace_v1(result)
    return RunAnalyticsResponse(notebook_id=notebook_id, cells=cells, trace=trace)


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
