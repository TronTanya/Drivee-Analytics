"""Схемы Drivee Quality Center: understanding, visualization, guardrails, aggregate, prompt stability."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.evaluation_nl_sql import GoldenExpectedSpec

EvaluationMode = Literal["live", "mock", "deterministic"]


class UnderstandingExpected(GoldenExpectedSpec):
    confidence_min: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    limit: Optional[int] = Field(default=None, ge=1, le=1000)
    filters: list[dict[str, Any]] = Field(default_factory=list)


class UnderstandingCase(BaseModel):
    id: str
    category: str
    prompt: str
    role: str = "manager"
    context: Optional[dict[str, Any]] = None
    expected: UnderstandingExpected


class UnderstandingDatasetFile(BaseModel):
    version: int = 1
    description: str = ""
    cases: list[UnderstandingCase] = Field(default_factory=list)


class VisualizationExpected(BaseModel):
    chart_type: Optional[str] = None
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    series: list[str] = Field(default_factory=list)
    result_shape: list[str] = Field(default_factory=list)


class VisualizationCase(BaseModel):
    id: str
    prompt: str
    role: str = "manager"
    expected: VisualizationExpected


class VisualizationDatasetFile(BaseModel):
    version: int = 1
    description: str = ""
    cases: list[VisualizationCase] = Field(default_factory=list)


class GuardrailsSafetyExpected(BaseModel):
    should_execute: bool = False
    blocked: bool = True
    reason_contains: list[str] = Field(default_factory=list)


class GuardrailsSafetyCase(BaseModel):
    id: str
    category: str
    prompt: str
    role: str = "manager"
    expected: GuardrailsSafetyExpected


class GuardrailsSafetyDatasetFile(BaseModel):
    version: int = 1
    description: str = ""
    cases: list[GuardrailsSafetyCase] = Field(default_factory=list)


class PromptStabilityRequest(BaseModel):
    prompt: str
    runs: int = Field(default=5, ge=1, le=50)
    mode: EvaluationMode = "deterministic"


class PromptStabilityRow(BaseModel):
    run_index: int
    outcome: str
    clarification_required: bool
    execution_status: str
    sql_preview: str = ""
    blocked: bool = False


class PromptStabilityResponse(BaseModel):
    prompt: str
    runs: int
    stability_score: float = Field(ge=0.0, le=1.0)
    outcomes: dict[str, int] = Field(default_factory=dict)
    results: list[PromptStabilityRow] = Field(default_factory=list)


class QualitySuiteSummary(BaseModel):
    suite: str
    total_cases: int = 0
    passed_cases: int = 0
    overall_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    mode: EvaluationMode = "mock"
    extra: dict[str, Any] = Field(default_factory=dict)


class QualityCenterOverview(BaseModel):
    overall_quality_score: float = Field(default=0.0, ge=0.0, le=1.0)
    nl_sql_understanding: QualitySuiteSummary
    sql_correctness: QualitySuiteSummary
    visualization_match: QualitySuiteSummary
    guardrails_safety: QualitySuiteSummary
    updated_at: str = ""
    mode: EvaluationMode = "mock"


class QualityCenterRunRequest(BaseModel):
    mode: EvaluationMode = "mock"
    suites: list[str] = Field(
        default_factory=lambda: ["understanding", "sql_correctness", "visualization", "guardrails"]
    )


class RepairBriefLatestResponse(BaseModel):
    found: bool = False
    run_id: str = ""
    overall_quality_score: Optional[float] = None
    repair_brief_md: str = ""
