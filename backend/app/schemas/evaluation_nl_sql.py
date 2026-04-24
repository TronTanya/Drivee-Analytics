"""Схемы API и сервиса Golden NL→SQL Evaluation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

EvaluationMode = Literal["live", "mock", "deterministic"]


class GoldenExpectedSpec(BaseModel):
    intent: Optional[str] = None
    metric: Optional[str] = None
    dimensions: list[str] = Field(default_factory=list)
    time_range: Optional[str] = None
    chart_type: Optional[str] = None
    requires_clarification: bool = False
    should_execute: bool = True
    sql_must_contain: list[str] = Field(default_factory=list)
    sql_must_not_contain: list[str] = Field(default_factory=list)
    explanation_must_contain: list[str] = Field(default_factory=list)


class GoldenCase(BaseModel):
    id: str
    category: str
    prompt: str
    role: str
    expected: GoldenExpectedSpec


class GoldenDatasetFile(BaseModel):
    version: int = 1
    description: str = ""
    cases: list[GoldenCase] = Field(default_factory=list)


class InterpretationSnapshot(BaseModel):
    intent: str = ""
    metric: str = ""
    dimensions: list[str] = Field(default_factory=list)
    time_range: str = ""
    filters: list[dict[str, Any]] = Field(default_factory=list)
    chart_type: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    requires_clarification: bool = False
    clarification_question: Optional[str] = None


class TraceStepSnapshot(BaseModel):
    step: str
    status: Literal["passed", "failed", "skipped"]
    message: str = ""


class CaseChecks(BaseModel):
    intent: bool = True
    metric: bool = True
    dimensions: bool = True
    time_range: bool = True
    chart_type: bool = True
    clarification: bool = True
    guardrail: bool = True
    sql_contains: bool = True
    sql_safety: bool = True


class CaseEvaluationResult(BaseModel):
    id: str
    prompt: str
    category: str
    passed: bool
    score: float = Field(ge=0.0, le=1.0)
    expected: dict[str, Any]
    actual: dict[str, Any]
    checks: CaseChecks
    failure_reason: Optional[str] = None


class EvaluationSummary(BaseModel):
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    overall_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    intent_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    metric_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    dimension_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    time_range_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    chart_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    clarification_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    guardrail_accuracy: float = Field(default=0.0, ge=0.0, le=1.0)
    sql_validation_pass_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    confidence_average: float = Field(default=0.0, ge=0.0, le=1.0)
    updated_at: str = ""
    mode: EvaluationMode = "mock"
    deterministic_eval: bool = False


class EvaluationRunRequest(BaseModel):
    mode: EvaluationMode = "mock"


class EvaluationRunResponse(BaseModel):
    summary: EvaluationSummary
    case_results: list[CaseEvaluationResult] = Field(default_factory=list)


class GoldenCasePublic(BaseModel):
    id: str
    category: str
    prompt: str
    role: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
