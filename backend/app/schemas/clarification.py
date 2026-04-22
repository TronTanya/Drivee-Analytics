"""Clarification engine API shape (ambiguous NL → question + options, no guessing)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ClarificationOption(BaseModel):
    label: str
    value: str


class ClarificationResponse(BaseModel):
    """Aligned with product JSON for clarification turns."""

    clarification_required: bool = False
    clarification_reason: str = ""
    clarification_question: str = ""
    clarification_options: list[ClarificationOption] = Field(default_factory=list)

    def to_trace_dict(self, confidence_score: float) -> dict:
        return {
            "clarification_required": self.clarification_required,
            "clarification_reason": self.clarification_reason,
            "clarification_question": self.clarification_question,
            "clarification_options": [o.model_dump() for o in self.clarification_options],
            "confidence_score": confidence_score,
        }
