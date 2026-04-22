"""Legacy facade over SQLValidatorService; raises SQLGuardrailError on hard failures."""

from __future__ import annotations

from typing import Optional, Tuple

from app.schemas.sql_validation import SQLValidationResult
from app.services.sql_validation import get_sql_validator


class SQLGuardrailError(ValueError):
    pass


def validate_sql_structured(sql: str, role_key: Optional[str] = None) -> SQLValidationResult:
    return get_sql_validator().validate(sql, role_key=role_key)


def prepare_validated_sql(sql: str, role_key: Optional[str] = None) -> Tuple[str, str, SQLValidationResult]:
    """Returns (normalized_sql, final_sql, result). Raises SQLGuardrailError if invalid."""
    result = validate_sql_structured(sql, role_key=role_key)
    if not result.is_valid:
        raise SQLGuardrailError(result.errors[0] if result.errors else "SQL validation failed")
    return result.normalized_sql, result.final_sql, result


def validate_select_only(sql: str) -> str:
    """Backward-compatible helper: returns normalized lowercase SQL or raises."""
    r = validate_sql_structured(sql, role_key=None)
    if not r.is_valid:
        raise SQLGuardrailError(r.errors[0] if r.errors else "SQL validation failed")
    return r.normalized_sql


def validate_whitelist(sql: str) -> None:
    """Deprecated: table checks are inside validate_sql_structured."""
    r = validate_sql_structured(sql, role_key=None)
    if not r.is_valid:
        raise SQLGuardrailError(r.errors[0] if r.errors else "SQL validation failed")


def enforce_limit(sql: str) -> str:
    """Deprecated: LIMIT policy is applied in SQLValidatorService."""
    r = validate_sql_structured(sql, role_key=None)
    if not r.is_valid:
        raise SQLGuardrailError(r.errors[0] if r.errors else "SQL validation failed")
    return r.final_sql
