"""API schemas for query corrections (admin learning)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

CorrectionTypeLiteral = Literal["sql_rewrite", "semantic_mapping"]


class QueryCorrectionCreate(BaseModel):
    workspace_id: uuid.UUID
    original_query: str = Field(..., min_length=1)
    generated_sql: str = Field(..., min_length=1)
    corrected_sql: str = Field(..., min_length=1)
    correction_type: CorrectionTypeLiteral
    semantic_terms_before: list[str] = Field(default_factory=list)
    semantic_terms_after: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


class QueryCorrectionResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    workspace_id: uuid.UUID
    query_normalized: str
    original_query: str
    generated_sql: str
    corrected_sql: str
    correction_type: str
    semantic_terms_before: list[Any]
    semantic_terms_after: list[Any]
    created_by: Optional[uuid.UUID]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
