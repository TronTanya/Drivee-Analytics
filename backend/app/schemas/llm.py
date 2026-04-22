"""Structured LLM I/O schemas for orchestration use-cases."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

LLMIntentKind = Literal["trend", "comparison", "ranking", "share", "geo", "summary", "forecast"]


class LLMQueryInterpretation(BaseModel):
    intent: LLMIntentKind = "summary"
    metrics: list[str] = Field(default_factory=list)
    dimensions: list[str] = Field(default_factory=list)
    filters: list[str] = Field(default_factory=list)
    time_period: Optional[str] = None
    ambiguities: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)

    @field_validator("intent", mode="before")
    @classmethod
    def _normalize_intent(cls, value: object) -> str:
        if value is None:
            return "summary"
        raw = str(value).strip().lower()
        alias_map = {
            "top_n": "ranking",
            "topn": "ranking",
            "top": "ranking",
            "rank": "ranking",
            "overview": "summary",
            "aggregate": "summary",
        }
        return alias_map.get(raw, raw)


class LLMClarificationOption(BaseModel):
    label: str
    value: str


class LLMClarificationResult(BaseModel):
    clarification_required: bool = False
    clarification_question: str = ""
    clarification_options: list[LLMClarificationOption] = Field(default_factory=list)

    @field_validator("clarification_question", mode="before")
    @classmethod
    def _normalize_question(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value)

    @field_validator("clarification_options", mode="before")
    @classmethod
    def _normalize_options(cls, value: object) -> list[object]:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return []


class LLMFollowUpRewriteResult(BaseModel):
    is_followup: bool = False
    rewritten_query: str = ""
    used_context_fields: list[str] = Field(default_factory=list)

    @field_validator("rewritten_query", mode="before")
    @classmethod
    def _normalize_rewrite(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value)


class LLMExplainabilityResult(BaseModel):
    explanation_text: str = ""

    @field_validator("explanation_text", mode="before")
    @classmethod
    def _normalize_explanation(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value)


class LLMInsightResult(BaseModel):
    insight_title: str = ""
    insight_text: str = ""

    @field_validator("insight_title", "insight_text", mode="before")
    @classmethod
    def _normalize_texts(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value)
