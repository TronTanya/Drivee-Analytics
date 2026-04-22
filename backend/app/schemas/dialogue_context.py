"""Context-aware dialogue: follow-up detection, inheritance, rewritten NL for execution."""

from __future__ import annotations

from typing import Any, Dict

from pydantic import BaseModel, Field


class DialogueContextResult(BaseModel):
    is_followup: bool = False
    resolved_context: dict[str, Any] = Field(default_factory=dict)
    rewritten_query_for_execution: str = ""
    inheritance_trace: list[str] = Field(default_factory=list)
    entity_overrides: dict[str, Any] = Field(default_factory=dict)

    def to_api_dict(self) -> Dict[str, Any]:
        return {
            "is_followup": self.is_followup,
            "resolved_context": self.resolved_context,
            "rewritten_query_for_execution": self.rewritten_query_for_execution,
            "inheritance_trace": self.inheritance_trace,
            "trace_explanation": "; ".join(self.inheritance_trace) if self.inheritance_trace else "",
        }
