"""Structured SQL validation result (guardrails + role-aware checks)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SQLValidationResult(BaseModel):
    is_valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    normalized_sql: str = ""
    final_sql: str = ""
    applied_rules: list[str] = Field(default_factory=list)
    accessible_tables: list[str] = Field(default_factory=list)
    role_access_check: bool = True
