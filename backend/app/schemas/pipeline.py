"""DTOs for NL→SQL analytics pipeline (API / legacy mock responses)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel

NotebookCellTypeLiteral = Literal[
    "prompt",
    "clarification",
    "sql",
    "table",
    "chart",
    "insight",
    "trace",
    "forecast",
]


class PipelineCellItem(BaseModel):
    id: str
    type: NotebookCellTypeLiteral
    content: str
    payload: Optional[dict[str, Any]] = None
