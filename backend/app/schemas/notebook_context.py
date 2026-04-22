"""Notebook execution context — filters, metric focus, scenario metadata (platform + notebook core)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ScenarioSnapshot(BaseModel):
    title: str
    description: Optional[str] = None
    saved_at: Optional[datetime] = None
    source_notebook_id: Optional[str] = None
    cell_ids: list[str] = Field(default_factory=list)


class NotebookContext(BaseModel):
    """Merged into `notebooks.context_chain_json` and cell `context_snapshot_json`."""

    time_window: Optional[str] = None
    base_metric: Optional[str] = None
    active_filters: dict[str, Any] = Field(default_factory=dict)
    dimensions: list[str] = Field(default_factory=list)
    last_intent: Optional[str] = None
    last_user_query: Optional[str] = None
    last_rewritten_query: Optional[str] = None
    last_intent_kind: Optional[str] = None
    status_filters: list[str] = Field(default_factory=list)
    channel_filters: list[str] = Field(default_factory=list)
    dialogue_turn: int = 0
    clarification_round: int = 0
    locale: Optional[str] = None
    scenario: Optional[ScenarioSnapshot] = None

    def to_json_dict(self) -> dict:
        return self.model_dump(mode="json", exclude_none=True)

    @classmethod
    def from_json_dict(cls, data: dict) -> NotebookContext:
        if not data:
            return NotebookContext()
        return cls.model_validate(data)
