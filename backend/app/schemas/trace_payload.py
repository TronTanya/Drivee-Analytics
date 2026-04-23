"""Canonical analytics / NL→SQL explainability trace (API + notebook cells)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

ValidationStatusLiteral = Literal["pending", "passed", "failed", "unknown"]


class SemanticTermTraceItem(BaseModel):
    term_key: str = ""
    surface_form: str = ""
    sql_fragment: str = ""
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class ChartRecommendationTrace(BaseModel):
    chart_type: str = "table"
    rationale: str = ""
    alternatives: list[str] = Field(default_factory=list)


class ForecastModeTrace(BaseModel):
    active: bool = False
    method: Optional[str] = None


class ForecastSelectionTrace(BaseModel):
    metric_key: Optional[str] = None
    selected_strategy: Optional[str] = None
    backtest_summary: dict[str, Any] = Field(default_factory=dict)
    data_quality: dict[str, Any] = Field(default_factory=dict)


class QualityGateTrace(BaseModel):
    status: Literal["passed", "warning", "failed"] = "passed"
    reasons: list[str] = Field(default_factory=list)


ExecutionPhaseStatusLiteral = Literal["pending", "running", "done", "failed", "skipped"]


class ExecutionPhaseTrace(BaseModel):
    """Стабильные пользовательские фазы MVP (маппинг из pipeline_steps оркестратора)."""

    phase_id: str
    label: str
    status: ExecutionPhaseStatusLiteral = "pending"
    detail: str = ""


class GuardrailsTrace(BaseModel):
    """Блокировки и политики NL→SQL (оркестратор + SQL-валидатор)."""

    blocked: bool = False
    codes: list[str] = Field(default_factory=list)
    messages_ru: list[str] = Field(default_factory=list)


class AnalyticsExplainabilityTraceV1(BaseModel):
    """Wire contract for TracePanel — versioned for forward-compatible clients."""

    schema_version: Literal[1] = 1
    interpreted_intent: str = ""
    extracted_entities: dict[str, Any] = Field(default_factory=dict)
    semantic_terms: list[SemanticTermTraceItem] = Field(default_factory=list)
    tables_used: list[str] = Field(default_factory=list)
    result_columns: list[str] = Field(
        default_factory=list,
        description="Output column names from execution when available.",
    )
    generated_sql: str = ""
    validation_status: ValidationStatusLiteral = "unknown"
    warnings: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    clarification_requested: bool = False
    follow_up_context_used: bool = False
    learned_correction_used: bool = False
    chart_recommendation: ChartRecommendationTrace = Field(default_factory=ChartRecommendationTrace)
    forecast_mode: ForecastModeTrace = Field(default_factory=ForecastModeTrace)
    forecast_selection: ForecastSelectionTrace = Field(default_factory=ForecastSelectionTrace)
    quality_gate: QualityGateTrace = Field(default_factory=QualityGateTrace)
    execution_phases: list[ExecutionPhaseTrace] = Field(
        default_factory=list,
        description="Порядок: parsing → generating_sql → validating → executing → visualizing → done.",
    )
    guardrails: GuardrailsTrace = Field(default_factory=GuardrailsTrace)
