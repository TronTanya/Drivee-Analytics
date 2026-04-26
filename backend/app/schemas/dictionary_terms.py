from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.auth.constants import RoleKey


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
    term_type: str = "metric"
    target_field: str | None = None
    filter_value: str | None = None
    description_ru: str = ""
    constraints: dict[str, Any] = Field(default_factory=dict)
    example_queries: list[str] = Field(default_factory=list)
    system_interpretation_ru: str = ""
    updated_at: str | None = None


class DictionaryEntryUpsertRequest(BaseModel):
    term: str = Field(min_length=1, max_length=255)
    synonyms: list[str] = Field(default_factory=list)
    sql_expression: str = Field(min_length=1)
    visibility_roles: list[RoleKey] = Field(default_factory=lambda: ["admin", "manager", "marketer", "executive"])
    domain: str = "custom_incity_orders"
    canonical_metric_key: str | None = None
    source_table: str = "incity_orders"
    source_column: str | None = None
    aggregation_type: str = "custom"
    term_type: str = "metric"
    target_field: str | None = None
    filter_value: str | None = None
    description_ru: str | None = None
    constraints: dict[str, Any] = Field(default_factory=dict)
    example_queries: list[str] = Field(default_factory=list)
    system_interpretation_ru: str | None = None


class DictionaryBootstrapResponse(BaseModel):
    added: int
    total: int


class DictionaryMetaResponse(BaseModel):
    version: str
    source: str
    term_count: int
    updated_at: str | None = None
