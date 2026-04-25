"""SQL validator: SELECT-only, mutation blocklist, table/column whitelist by role, LIMIT policy."""

from __future__ import annotations

import re
import logging
from typing import Any, List, Optional, Set

from app.core.config import Settings, settings as default_settings
from app.core.sql_validation_constants import (
    BLOCKED_SQL_VERBS,
    DEFAULT_ROLE_FALLBACK,
    ROLE_COLUMN_ALLOWLIST,
    ROLE_TABLE_ALLOWLIST,
    SQL_KEYWORDS,
)
from app.schemas.sql_validation import SQLValidationResult
from app.services.sql_validation.sql_trust import (
    build_data_correctness,
    build_performance_assessment,
    build_preview_assessment,
    build_query_explanation,
    check_bare_select_star,
    check_global_column_whitelist,
    check_group_by_heuristic,
    check_incity_orders_scan_policy,
    check_sensitive_columns_for_role,
    check_time_filter_heuristic,
    collect_schema_and_table_ref_errors,
    mandatory_limit_intent_set,
    scan_dangerous_constructs,
)
from app.services.security.sql_safety import collect_sql_mvp_safety_violations
from app.services.sql_validation.utils import (
    apply_default_limit,
    build_alias_to_table_map,
    clamp_limit_clause,
    extract_cte_names,
    extract_from_join_qualified,
    extract_from_join_tables,
    extract_qualified_columns,
    normalize_for_checks,
    pad_tokens,
    parse_limit_value,
    split_statements,
)

logger = logging.getLogger(__name__)


class SQLValidatorService:
    def __init__(self, app_settings: Optional[Settings] = None) -> None:
        self._s = app_settings or default_settings

    def validate(
        self,
        sql: str,
        *,
        role_key: Optional[str] = None,
        intent: Optional[str] = None,
        entities: Optional[dict[str, Any]] = None,
    ) -> SQLValidationResult:
        errors: List[str] = []
        warnings: List[str] = []
        applied: List[str] = []
        role_access_ok = True
        query_explanation: dict[str, Any] = {}
        preview_assessment: dict[str, Any] = {}
        data_correctness: dict[str, Any] = {}

        raw_stripped = sql.strip()
        if not raw_stripped:
            explainability = {
                "decision": "rejected",
                "reason_summary_ru": "SQL отклонён: пустой запрос.",
                "triggered_rules": ["reject_empty"],
                "errors": ["Empty SQL."],
                "warnings": [],
            }
            return SQLValidationResult(
                is_valid=False,
                errors=["Empty SQL."],
                warnings=[],
                normalized_sql="",
                final_sql="",
                applied_rules=["reject_empty"],
                accessible_tables=[],
                role_access_check=False,
                query_explanation=query_explanation,
                preview_assessment=preview_assessment,
                data_correctness=data_correctness,
                performance={},
                guardrail_explainability=explainability,
            )

        parts = split_statements(raw_stripped)
        if len(parts) > 1:
            errors.append("Multiple SQL statements are not allowed.")
            applied.append("single_statement_only")
            explainability = {
                "decision": "rejected",
                "reason_summary_ru": "SQL отклонён: обнаружено несколько SQL-выражений.",
                "triggered_rules": list(applied),
                "errors": list(errors),
                "warnings": list(warnings),
            }
            logger.warning("sql_guardrail_rejected reason=multiple_statements role=%s sql=%s", role_key, raw_stripped[:500])
            return SQLValidationResult(
                is_valid=False,
                errors=errors,
                warnings=warnings,
                normalized_sql=normalize_for_checks(raw_stripped),
                final_sql="",
                applied_rules=applied,
                accessible_tables=[],
                role_access_check=False,
                query_explanation=query_explanation,
                preview_assessment=preview_assessment,
                data_correctness=data_correctness,
                performance={},
                guardrail_explainability=explainability,
            )

        single = parts[0]
        normalized = normalize_for_checks(single)
        padded = pad_tokens(normalized)
        applied.append("normalize_whitespace")

        d_err, d_warn = scan_dangerous_constructs(normalized, padded)
        errors.extend(d_err)
        warnings.extend(d_warn)
        if d_err:
            applied.append("dangerous_construct_blocked")

        for msg in collect_sql_mvp_safety_violations(single, allow_union=bool(self._s.sql_allow_union)):
            errors.append(msg)
            applied.append("mvp_sql_safety")

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

        forbid_star = bool(self._s.sql_forbid_select_star) and not bool(self._s.mock_mode)
        if forbid_star and check_bare_select_star(normalized):
            errors.append("SELECT * / alias.* запрещены вне mock-режима; укажите колонки явно.")
            applied.append("reject_select_star")

        global_tables = {t.lower() for t in self._s.sql_whitelist_tables}
        cte_names = extract_cte_names(normalized)
        implicit_schema = (self._s.sql_implicit_schema or "public").strip().lower() or "public"
        qualified = extract_from_join_qualified(normalized, implicit_schema)
        filtered_qual = [(sch, tbl) for sch, tbl in qualified if tbl not in cte_names]
        ref_errs = collect_schema_and_table_ref_errors(qualified_refs=filtered_qual, settings=self._s)
        if ref_errs:
            errors.extend(ref_errs)
            applied.append("schema_table_policy")

        referenced = extract_from_join_tables(normalized, implicit_schema)
        physical_refs = referenced - cte_names
        accessible: Set[str] = set()

        if physical_refs:
            applied.append("global_table_whitelist")
            bad_tables = sorted(physical_refs - global_tables)
            staging_schema = (self._s.csv_staging_schema or "user_staging").strip().lower()
            pat = getattr(self._s, "sql_staging_upload_table_pattern", r"^t_[a-f0-9]{12}$") or r"^t_[a-f0-9]{12}$"
            try:
                staging_re = re.compile(pat, re.IGNORECASE)
            except re.error:
                staging_re = re.compile(r"^t_[a-f0-9]{12}$", re.IGNORECASE)

            def _staging_upload_base(name: str) -> bool:
                return any(
                    sch == staging_schema and staging_re.fullmatch(name)
                    for sch, tbl in filtered_qual
                    if tbl == name
                )

            bad_tables = [t for t in bad_tables if not _staging_upload_base(t)]
            if bad_tables:
                errors.append(f"Tables not on whitelist: {', '.join(bad_tables)}.")
            accessible = physical_refs & global_tables
            accessible |= {t for t in physical_refs if _staging_upload_base(t)}

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

        global_col_errors: List[str] = []
        global_col_warns: List[str] = []
        sens_errs = check_sensitive_columns_for_role(
            normalized=normalized,
            alias_map=alias_map,
            cte_names=cte_names,
            physical_basenames=physical_refs,
            role_key=role_key,
        )
        if sens_errs:
            errors.extend(sens_errs)
            applied.append("sensitive_column_policy")

        if self._s.sql_enforce_global_column_whitelist:
            gcols = {c.lower() for c in self._s.sql_whitelist_columns}
            phys_for_cols = physical_refs & global_tables
            global_col_errors, global_col_warns = check_global_column_whitelist(
                normalized=normalized,
                alias_map=alias_map,
                cte_names=cte_names,
                physical_tables=phys_for_cols,
                global_cols=gcols,
            )
            errors.extend(global_col_errors)
            warnings.extend(global_col_warns)
            applied.append("global_column_whitelist")

        detail_scan = check_incity_orders_scan_policy(normalized, padded, physical_refs)
        if detail_scan:
            errors.extend(detail_scan)
            applied.append("incity_orders_scan_policy")

        is_valid = len(errors) == 0

        final_sql = single
        if is_valid:
            max_lim = min(self._s.sql_default_limit, int(getattr(self._s, "sql_execution_hard_row_cap", 5000) or 5000))
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
            norm_final = normalize_for_checks(final_sql)
            lim_val, _ = parse_limit_value(norm_final)
            intent_l = (intent or "").strip().lower()
            if intent_l in mandatory_limit_intent_set(self._s) and lim_val is None:
                errors.append(f"Для intent «{intent_l}» обязателен LIMIT — не удалось применить политику.")
                is_valid = False
                final_sql = ""
                applied.append("mandatory_limit_missing")
            elif intent_l in mandatory_limit_intent_set(self._s):
                applied.append("mandatory_limit_ok")
                if " limit " not in pad_tokens(normalized):
                    warnings.append("LIMIT был автоматически добавлен политикой guardrails.")

        time_notes = check_time_filter_heuristic(normalized, physical_refs)
        group_notes = check_group_by_heuristic(normalized)
        warnings.extend(time_notes)
        warnings.extend(group_notes)

        has_time_tokens = (
            "order_timestamp" in normalized
            or "tender_timestamp" in normalized
            or "order_date_part" in normalized
            or "tender_date_part" in normalized
        )
        preview_assessment = build_preview_assessment(
            normalized=normalized,
            padded=padded,
            sql_default_limit=self._s.sql_default_limit,
            has_time_tokens=has_time_tokens,
        )

        performance: dict[str, Any] = {}
        if is_valid and final_sql.strip():
            padded_exec = pad_tokens(normalize_for_checks(final_sql))
            perf = build_performance_assessment(
                normalized=normalized,
                padded=padded_exec,
                preview_assessment=dict(preview_assessment),
                entities=entities,
                settings=self._s,
            )
            cap = int(perf.get("fetch_cap") or self._s.sql_default_limit)
            norm_exec = normalize_for_checks(final_sql)
            fs2, cperf = clamp_limit_clause(final_sql, norm_exec, cap)
            if cperf or fs2 != final_sql:
                final_sql = fs2
                applied.append("performance_fetch_cap")
            performance = {
                "explain_warnings_ru": list(perf.get("explain_warnings_ru") or []),
                "fetch_cap": cap,
                "sample_mode_applied": bool(perf.get("sample_mode_applied")),
                "window_days_estimate": perf.get("window_days_estimate"),
                "group_by_columns": perf.get("group_by_columns"),
                "rollup_recommendation_ru": perf.get("rollup_recommendation_ru") or "",
            }
            preview_assessment["explain_warnings_ru"] = list(perf.get("explain_warnings_ru") or [])
            preview_assessment["effective_row_cap"] = cap
            preview_assessment["sample_mode_applied"] = bool(perf.get("sample_mode_applied"))
            if perf.get("rollup_recommendation_ru"):
                preview_assessment["mvp_rollup_hint_ru"] = str(perf["rollup_recommendation_ru"])
            warnings.extend(str(x) for x in perf.get("explain_warnings_ru") or [])

        query_explanation = build_query_explanation(
            normalized=normalized,
            accessible_tables=sorted(accessible),
            entities=entities,
            intent=intent,
        )
        data_correctness = build_data_correctness(
            column_errors=list(global_col_errors),
            group_notes=group_notes,
            time_notes=time_notes,
            empty_result=False,
        )
        reason_reject_ru = "SQL отклонён guardrails-политикой."
        if not is_valid and errors:
            primary = str(errors[0]).strip()
            reason_reject_ru = f"SQL отклонён: {primary}" if primary else reason_reject_ru

        explainability = {
            "decision": "allowed" if is_valid else "rejected",
            "reason_summary_ru": (
                "SQL прошёл guardrails-проверки и разрешён к выполнению."
                if is_valid
                else reason_reject_ru
            ),
            "triggered_rules": list(dict.fromkeys(applied)),
            "errors": list(errors),
            "warnings": list(warnings),
            "policy_snapshot": {
                "select_only": True,
                "blocked_verbs": sorted(BLOCKED_SQL_VERBS),
                "table_whitelist_enabled": True,
                "column_whitelist_enabled": bool(self._s.sql_enforce_global_column_whitelist),
                "default_limit": int(self._s.sql_default_limit),
            },
        }

        if not is_valid:
            logger.warning(
                "sql_guardrail_rejected role=%s intent=%s rules=%s errors=%s sql=%s",
                role_key,
                intent,
                ",".join(applied),
                "; ".join(errors)[:400],
                raw_stripped[:800],
            )

        return SQLValidationResult(
            is_valid=is_valid,
            errors=errors,
            warnings=warnings,
            normalized_sql=normalized,
            final_sql=final_sql if is_valid else "",
            applied_rules=applied,
            accessible_tables=sorted(accessible),
            role_access_check=role_access_ok,
            query_explanation=query_explanation,
            preview_assessment=preview_assessment,
            data_correctness=data_correctness,
            performance=performance,
            guardrail_explainability=explainability,
        )


def get_sql_validator() -> SQLValidatorService:
    from app.services.sql_validation.effective_sql_settings import get_effective_sql_settings

    return SQLValidatorService(get_effective_sql_settings())
