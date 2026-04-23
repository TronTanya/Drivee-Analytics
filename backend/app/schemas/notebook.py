from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.notebook_context import NotebookContext
from app.schemas.pipeline import NotebookCellTypeLiteral


class NotebookCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    workspace_id: Optional[UUID] = None
    initial_context: Optional[NotebookContext] = None


class NotebookPatchRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = None
    notebook_status: Optional[str] = Field(default=None, max_length=32)


class NotebookCellCreateRequest(BaseModel):
    cell_type: NotebookCellTypeLiteral
    prompt_text: Optional[str] = None
    parent_cell_id: Optional[UUID] = None
    position: Optional[int] = Field(None, ge=1, description="If omitted, appends at end.")
    context_snapshot: Optional[NotebookContext] = None
    clarification_question: Optional[str] = None
    clarification_options_json: Optional[list[Any]] = None


class NotebookSaveScenarioRequest(BaseModel):
    scenario_title: str = Field(..., min_length=1, max_length=200)
    scenario_description: Optional[str] = None


class CellRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    cell_id: UUID
    notebook_id: UUID
    run_number: int
    run_status: str
    started_at: datetime
    finished_at: Optional[datetime]
    duration_ms: Optional[int]
    rows_returned: Optional[int]
    error_message: Optional[str]
    confidence_score: Optional[Decimal]


class NotebookCellResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    notebook_id: UUID
    cell_type: str
    position: int
    prompt_text: Optional[str]
    generated_sql: Optional[str]
    validation_status: str
    execution_status: str
    insight_text: Optional[str]
    confidence_score: Optional[Decimal]
    clarification_required: bool = False
    clarification_question: Optional[str] = None
    clarification_options_json: list[Any] = Field(default_factory=list)
    parent_cell_id: Optional[UUID]
    context_snapshot_json: dict[str, Any]
    trace_payload_json: dict[str, Any]
    forecast_payload_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class NotebookDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    owner_user_id: UUID
    title: str
    description: Optional[str]
    notebook_status: str
    context_chain_json: dict[str, Any]
    latest_cell_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    cells: list[NotebookCellResponse] = Field(default_factory=list)


class NotebookListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    workspace_id: UUID
    owner_user_id: UUID
    title: str
    notebook_status: str
    latest_cell_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime


class RunCellResponse(BaseModel):
    cell_run: CellRunResponse
    source_cell: NotebookCellResponse
    appended_cells: list[NotebookCellResponse] = Field(default_factory=list)


class RerunNotebookResponse(BaseModel):
    runs: list[RunCellResponse] = Field(default_factory=list)


class SaveNotebookResponse(BaseModel):
    notebook_id: UUID
    context_chain_json: dict[str, Any]
