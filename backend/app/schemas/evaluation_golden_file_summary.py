"""HTTP-схема сводки golden NL→SQL из `evals/results/latest_eval_results.json`."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class NlSqlGoldenEvalMetrics(BaseModel):
    nl_sql_accuracy: float = Field(0.0, ge=0.0, le=1.0)
    sql_safety: float = Field(0.0, ge=0.0, le=1.0)
    chart_accuracy: float = Field(0.0, ge=0.0, le=1.0)
    clarification_accuracy: float = Field(0.0, ge=0.0, le=1.0)
    trace_completeness: float = Field(0.0, ge=0.0, le=1.0)


class NlSqlGoldenEvalCaseRow(BaseModel):
    id: str
    question: str
    expected_status: str
    actual_status: str
    chart: str = ""
    guardrails: str = ""
    passed: bool


class NlSqlGoldenEvalSummaryResponse(BaseModel):
    total_cases: int = Field(ge=0)
    passed_cases: int = Field(ge=0)
    score: float = Field(ge=0.0, le=1.0)
    metrics: NlSqlGoldenEvalMetrics = Field(default_factory=NlSqlGoldenEvalMetrics)
    cases: list[NlSqlGoldenEvalCaseRow] = Field(default_factory=list)
    generated_at: Optional[str] = None
    mode: Optional[str] = None
    source: str = Field(default="", description="Путь к JSON или missing.")
