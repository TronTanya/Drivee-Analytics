"""Structured LLM I/O schemas for orchestration use-cases."""

from __future__ import annotations

from typing import Literal, Optional, get_args

from pydantic import BaseModel, Field, field_validator

LLMIntentKind = Literal["trend", "comparison", "ranking", "share", "geo", "summary", "forecast"]
_LLM_INTENTS: frozenset[str] = frozenset(get_args(LLMIntentKind))
LLMQueryScope = Literal["data", "general"]


class LLMQueryInterpretation(BaseModel):
    """Если query_scope=general — вопрос вне датасета заказов; оркестратор ответит текстом без SQL."""

    intent: LLMIntentKind = "summary"
    query_scope: LLMQueryScope = Field(
        default="data",
        description='"general" для приветствий, общих знаний и т.п.; "data" для вопросов по метрикам/заказам.',
    )
    metrics: list[str] = Field(default_factory=list)
    dimensions: list[str] = Field(default_factory=list)
    filters: list[str] = Field(default_factory=list)
    time_period: Optional[str] = None
    comparison: Optional[str] = None
    sort: Optional[str] = None
    limit: Optional[int] = None
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
            "aggregation": "summary",
            "count": "summary",
            "kpi": "summary",
            "metric": "summary",
        }
        out = alias_map.get(raw, raw)
        if out not in _LLM_INTENTS:
            return "summary"
        return out

    @field_validator("query_scope", mode="before")
    @classmethod
    def _normalize_query_scope(cls, value: object) -> str:
        if value is None:
            return "data"
        raw = str(value).strip().lower()
        if raw in ("general", "non_data", "off_topic", "chitchat", "smalltalk"):
            return "general"
        return "data"


class LLMGeneralQueryAnswer(BaseModel):
    """Краткий ответ без SQL (разговорный слой)."""

    reply: str = ""

    @field_validator("reply", mode="before")
    @classmethod
    def _normalize_reply(cls, value: object) -> str:
        if value is None:
            return ""
        return str(value).strip()


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
