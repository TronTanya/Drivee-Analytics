"""SQL validator: SELECT-only, mutation blocklist, table/column whitelist by role, LIMIT policy."""

from __future__ import annotations

from typing import List, Optional, Set

from app.core.config import Settings, settings as default_settings
from app.core.sql_validation_constants import (
    BLOCKED_SQL_VERBS,
    DEFAULT_ROLE_FALLBACK,
    ROLE_COLUMN_ALLOWLIST,
    ROLE_TABLE_ALLOWLIST,
    SQL_KEYWORDS,
)
from app.schemas.sql_validation import SQLValidationResult
from app.services.sql_validation.utils import (
    apply_default_limit,
    build_alias_to_table_map,
    clamp_limit_clause,
    extract_cte_names,
    extract_from_join_tables,
    extract_qualified_columns,
    normalize_for_checks,
    pad_tokens,
    split_statements,
)


class SQLValidatorService:
    def __init__(self, app_settings: Optional[Settings] = None) -> None:
        self._s = app_settings or default_settings

    def validate(self, sql: str, *, role_key: Optional[str] = None) -> SQLValidationResult:
        errors: List[str] = []
        warnings: List[str] = []
        applied: List[str] = []
        role_access_ok = True

        raw_stripped = sql.strip()
        if not raw_stripped:
            return SQLValidationResult(
                is_valid=False,
                errors=["Empty SQL."],
                warnings=[],
                normalized_sql="",
                final_sql="",
                applied_rules=["reject_empty"],
                accessible_tables=[],
                role_access_check=False,
            )

        parts = split_statements(raw_stripped)
        if len(parts) > 1:
            errors.append("Multiple SQL statements are not allowed.")
            applied.append("single_statement_only")
            return SQLValidationResult(
                is_valid=False,
                errors=errors,
                warnings=warnings,
                normalized_sql=normalize_for_checks(raw_stripped),
                final_sql="",
                applied_rules=applied,
                accessible_tables=[],
                role_access_check=False,
            )

        single = parts[0]
        normalized = normalize_for_checks(single)
        padded = pad_tokens(normalized)
        applied.append("normalize_whitespace")

        mutation_hits: List[str] = []
        for verb in sorted(BLOCKED_SQL_VERBS):
            token = f" {verb} "
            if token in padded:
                mutation_hits.append(f"Forbidden statement or clause: {verb.upper()}.")
                applied.append(f"block_{verb}")
        if mutation_hits:
            errors.extend(mutation_hits)
        elif not (normalized.startswith("select") or normalized.startswith("with")):
            errors.append("Only SELECT or WITH (CTE) read queries are allowed.")
            applied.append("select_or_with_only")
        else:
            applied.append("select_or_with_only")

        global_tables = {t.lower() for t in self._s.sql_whitelist_tables}
        referenced = extract_from_join_tables(normalized)
        cte_names = extract_cte_names(normalized)
        physical_refs = referenced - cte_names
        accessible: Set[str] = set()

        if physical_refs:
            applied.append("global_table_whitelist")
            bad_tables = sorted(physical_refs - global_tables)
            if bad_tables:
                errors.append(f"Tables not on whitelist: {', '.join(bad_tables)}.")
            accessible = physical_refs & global_tables

        effective_role: Optional[str] = None
        if role_key:
            effective_role = role_key.strip().lower()
            if effective_role not in ROLE_TABLE_ALLOWLIST:
                effective_role = DEFAULT_ROLE_FALLBACK
                warnings.append(f"Unknown role; using default policy role={DEFAULT_ROLE_FALLBACK}.")

        role_tables_policy = ROLE_TABLE_ALLOWLIST.get(effective_role) if effective_role else None
        if effective_role and role_tables_policy is not None:
            applied.append("role_table_allowlist")
            denied = sorted(physical_refs - set(role_tables_policy))
            if denied:
                role_access_ok = False
                errors.append(f"Role '{effective_role}' may not access tables: {', '.join(denied)}.")
            accessible = accessible & set(role_tables_policy)

        alias_map = build_alias_to_table_map(normalized)
        col_policy = ROLE_COLUMN_ALLOWLIST.get(effective_role) if effective_role else None
        if effective_role and col_policy is not None:
            applied.append("role_column_allowlist")
            for alias, col in extract_qualified_columns(normalized):
                if alias in SQL_KEYWORDS:
                    continue
                table = alias_map.get(alias)
                if not table:
                    warnings.append(f"Could not resolve alias '{alias}' for column '{col}' (skipped strict check).")
                    continue
                if table in cte_names:
                    continue
                if table not in col_policy:
                    continue
                allowed = col_policy[table]
                if col not in allowed:
                    role_access_ok = False
                    errors.append(f"Role '{effective_role}' may not use column {table}.{col}.")

        if not role_access_ok:
            applied.append("role_column_violation")

        is_valid = len(errors) == 0

        final_sql = single
        if is_valid:
            max_lim = self._s.sql_default_limit
            final_sql, clamped = clamp_limit_clause(final_sql, normalized, max_lim)
            if clamped:
                warnings.append(f"LIMIT capped at {max_lim} per policy.")
                applied.append("limit_clamped")
            norm_after = normalize_for_checks(final_sql)
            if " limit " not in pad_tokens(norm_after):
                final_sql = apply_default_limit(final_sql, max_lim)
                applied.append("default_limit_appended")
            else:
                applied.append("limit_present_or_applied")

        return SQLValidationResult(
            is_valid=is_valid,
            errors=errors,
            warnings=warnings,
            normalized_sql=normalized,
            final_sql=final_sql if is_valid else "",
            applied_rules=applied,
            accessible_tables=sorted(accessible),
            role_access_check=role_access_ok,
        )


def get_sql_validator() -> SQLValidatorService:
    return SQLValidatorService()
