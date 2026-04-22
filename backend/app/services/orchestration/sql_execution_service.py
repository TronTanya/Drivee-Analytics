"""SQL execution with guardrails; mock or PostgreSQL via SQLAlchemy engine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

import pandas as pd
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.schemas.sql_validation import SQLValidationResult
from app.services.sql_validation import get_sql_validator


@dataclass
class ExecutionResult:
    ok: bool
    rows: list[dict[str, Any]]
    columns: list[str]
    rowcount: int
    error: Optional[str] = None
    normalized_sql: str = ""
    final_sql: str = ""
    validation_warnings: list[str] = field(default_factory=list)
    sql_validation: Optional[SQLValidationResult] = None


class SQLExecutionService:
    def __init__(self, validator: Optional[Any] = None) -> None:
        self._validator = validator or get_sql_validator()

    def validate(self, sql: str, role_key: Optional[str] = None) -> SQLValidationResult:
        return self._validator.validate(sql, role_key=role_key)

    def execute(
        self,
        sql: Optional[str] = None,
        *,
        validation: Optional[SQLValidationResult] = None,
        role_key: Optional[str] = None,
    ) -> ExecutionResult:
        if validation is None:
            if sql is None:
                raise ValueError("execute requires sql= or validation=")
            validation = self.validate(sql, role_key=role_key)

        warnings = list(validation.warnings)
        if not validation.is_valid:
            return ExecutionResult(
                ok=False,
                rows=[],
                columns=[],
                rowcount=0,
                error=validation.errors[0] if validation.errors else "SQL validation failed",
                normalized_sql=validation.normalized_sql,
                final_sql=validation.final_sql,
                validation_warnings=warnings + list(validation.errors),
                sql_validation=validation,
            )

        normalized = validation.normalized_sql
        final = validation.final_sql

        if settings.mock_mode:
            df = pd.DataFrame(
                {
                    "bucket": pd.date_range("2026-01-01", periods=6, freq="W"),
                    "value": [100, 110, 105, 120, 118, 130],
                }
            )
            rows = df.to_dict(orient="records")
            for r in rows:
                if hasattr(r.get("bucket"), "isoformat"):
                    r["bucket"] = r["bucket"].isoformat()
            return ExecutionResult(
                ok=True,
                rows=rows,
                columns=list(df.columns),
                rowcount=len(rows),
                normalized_sql=normalized,
                final_sql=final,
                validation_warnings=warnings,
                sql_validation=validation,
            )

        timeout_ms = int(settings.sql_timeout_seconds * 1000)
        try:
            with engine.connect() as conn:
                with conn.begin():
                    conn.execute(text(f"SET LOCAL statement_timeout = {timeout_ms}"))
                    result = conn.execute(text(final))
                    columns = list(result.keys()) if result.keys() else []
                    raw_rows = result.fetchmany(settings.sql_default_limit)
                    rows = [dict(zip(columns, row)) for row in raw_rows]
                    return ExecutionResult(
                        ok=True,
                        rows=rows,
                        columns=columns,
                        rowcount=len(rows),
                        normalized_sql=normalized,
                        final_sql=final,
                        validation_warnings=warnings,
                        sql_validation=validation,
                    )
        except Exception as exc:
            return ExecutionResult(
                ok=False,
                rows=[],
                columns=[],
                rowcount=0,
                error=str(exc),
                normalized_sql=normalized,
                final_sql=final,
                validation_warnings=warnings,
                sql_validation=validation,
            )
