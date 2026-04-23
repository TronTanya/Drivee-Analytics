from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class DictionaryEntryResponse(BaseModel):
    """Публичный контракт для UI словаря и мок-фолбэка фронта."""

    id: str
    term: str = Field(description="Основной бизнес-термин для отображения")
    synonyms: list[str] = Field(default_factory=list)
    sql_expression: str
    visibility_roles: list[str] = Field(default_factory=list)
    domain: str = ""
    canonical_metric_key: str = ""
    source_table: str = ""
    source_column: str | None = None
    aggregation_type: str = ""
    constraints: dict[str, Any] = Field(default_factory=dict)
    example_queries: list[str] = Field(default_factory=list)
    system_interpretation_ru: str = ""
    updated_at: str | None = None
