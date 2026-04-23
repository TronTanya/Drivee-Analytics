"""API / notebook-facing schemas for the NL→SQL orchestration pipeline."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

ForecastSidecarOverride = Literal["auto", "on", "off"]

from pydantic import BaseModel, Field

from app.schemas.clarification import ClarificationResponse
from app.schemas.dialogue_context import DialogueContextResult
from app.schemas.sql_validation import SQLValidationResult
from app.schemas.visualization import VisualizationRecommendation

IntentKind = Literal["trend", "comparison", "ranking", "share", "geo", "summary", "forecast"]
SqlGenerationSource = Literal["default_template", "semantic_mapping", "learned_correction"]


class AmbiguityPayload(BaseModel):
    required: bool = False
    question: Optional[str] = None
    options: list[str] = Field(default_factory=list)
    reason: Optional[str] = None


class SemanticTermResolution(BaseModel):
    term_key: str
    surface_form: str
    sql_fragment: str
    confidence: float = 1.0


class OrchestrationInput(BaseModel):
    raw_query: str
    notebook_context: dict[str, Any] = Field(default_factory=dict)
    workspace_id: Optional[str] = None
    role_key: Optional[str] = None
    user_id: Optional[str] = None
    force_fresh_dialogue: bool = False
    skip_learned_corrections: bool = False
    forecast_sidecar: ForecastSidecarOverride = "auto"
    chart_type_override: Optional[str] = Field(
        None,
        description="Подмена типа графика в trace/cells после рекомендации (bar, line, table, …).",
    )


class PipelineStepTrace(BaseModel):
    name: str
    ok: bool = True
    detail: dict[str, Any] = Field(default_factory=dict)


class ChartRecommendation(BaseModel):
    chart_type: str
    rationale: str
    alternatives: list[str] = Field(default_factory=list)


class OrchestrationOutput(BaseModel):
    preprocessed_query: str
    effective_query: str
    is_follow_up: bool = False
    intent: IntentKind
    entities: dict[str, Any] = Field(default_factory=dict)
    semantic_resolutions: list[SemanticTermResolution] = Field(default_factory=list)
    ambiguity: AmbiguityPayload = Field(default_factory=AmbiguityPayload)
    confidence_score: float = Field(ge=0.0, le=1.0)
    sql_generation_source: SqlGenerationSource = "default_template"
    applied_correction_id: Optional[uuid.UUID] = None
    correction_similarity: Optional[float] = None
    correction_match_kind: Optional[str] = None
    generated_sql: str = ""
    validated_sql: str = ""
    validation_warnings: list[str] = Field(default_factory=list)
    execution_status: str = "not_started"
    rows_returned: int = 0
    result_preview: list[dict[str, Any]] = Field(default_factory=list)
    result_columns: list[str] = Field(default_factory=list)
    chart: ChartRecommendation = Field(default_factory=lambda: ChartRecommendation(chart_type="table", rationale=""))
    insight_text: str = ""
    forecast_records: list[dict[str, Any]] = Field(default_factory=list)
    trace_payload: dict[str, Any] = Field(default_factory=dict)
    pipeline_steps: list[PipelineStepTrace] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    llm_suggested: bool = False
    sql_validation: Optional[SQLValidationResult] = None
    clarification: Optional[ClarificationResponse] = None
    dialogue: Optional[DialogueContextResult] = None
    visualization: Optional[VisualizationRecommendation] = None
