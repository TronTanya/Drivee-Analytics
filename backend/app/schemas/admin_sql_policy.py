"""API схемы для админской политики SQL."""

from __future__ import annotations

import re
from typing import Optional

from pydantic import BaseModel, Field, field_validator

_SQL_IDENT = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


class AdminSqlPolicyResponse(BaseModel):
    extra_whitelist_tables: list[str] = Field(default_factory=list)
    extra_whitelist_columns: list[str] = Field(default_factory=list)
    nl_max_result_rows: Optional[int] = None
    effective_whitelist_tables: list[str] = Field(default_factory=list)
    effective_whitelist_columns: list[str] = Field(default_factory=list)
    effective_sql_default_limit: int = 1000


class AdminSqlPolicyUpdate(BaseModel):
    extra_whitelist_tables: list[str] = Field(default_factory=list, max_length=48)
    extra_whitelist_columns: list[str] = Field(default_factory=list, max_length=200)
    nl_max_result_rows: Optional[int] = Field(
        default=None,
        description="Верхняя граница LIMIT для NL→SQL (не больше server sql_default_limit и hard cap). Пусто — только env.",
    )

    @field_validator("extra_whitelist_tables", "extra_whitelist_columns", mode="before")
    @classmethod
    def _strip_list(cls, v: object) -> list[str]:
        if v is None:
            return []
        if not isinstance(v, list):
            raise TypeError("expected list of strings")
        return [str(x).strip().lower() for x in v if str(x).strip()]

    @field_validator("extra_whitelist_tables", "extra_whitelist_columns", mode="after")
    @classmethod
    def _check_idents(cls, v: list[str]) -> list[str]:
        for x in v:
            if not _SQL_IDENT.match(x):
                raise ValueError(f"Недопустимый SQL-идентификатор: {x!r} (только a-z, цифры, _).")
        return v
