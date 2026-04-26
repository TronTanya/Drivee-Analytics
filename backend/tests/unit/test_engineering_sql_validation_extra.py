"""Unit: дополнительные проверки SQLValidatorService (политика + LIMIT)."""

from __future__ import annotations

from app.core.config import Settings
from app.services.sql_validation.validator_service import SQLValidatorService


def test_valid_ranking_sql_with_limit_passes() -> None:
    s = Settings(mock_mode=True, sql_enforce_global_column_whitelist=False, sql_forbid_select_star=True)
    v = SQLValidatorService(s)
    sql = (
        "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM incity_orders a "
        "WHERE a.order_timestamp >= current_date - interval '7 day' "
        "GROUP BY 1 ORDER BY value DESC LIMIT 10"
    )
    r = v.validate(sql, role_key="admin", intent="ranking")
    assert r.is_valid, r.errors


def test_admin_allowed_whitelisted_columns() -> None:
    s = Settings(mock_mode=True, sql_enforce_global_column_whitelist=True)
    v = SQLValidatorService(s)
    sql = (
        "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM incity_orders a "
        "WHERE a.order_timestamp >= current_date - interval '3 day' "
        "GROUP BY 1 ORDER BY value DESC LIMIT 5"
    )
    r = v.validate(sql, role_key="admin", intent="ranking")
    assert r.is_valid, r.errors


def test_missing_limit_for_policy_intent_gets_guardrail_note() -> None:
    s = Settings(mock_mode=True, sql_enforce_global_column_whitelist=False, sql_result_fetch_unbounded=False)
    v = SQLValidatorService(s)
    sql = (
        "SELECT a.city_id::text AS dim, COUNT(*) AS value "
        "FROM incity_orders a "
        "WHERE a.order_timestamp >= current_date - interval '7 day' "
        "GROUP BY 1 ORDER BY value DESC"
    )
    r = v.validate(sql, role_key="admin", intent="ranking")
    assert r.is_valid, r.errors
    assert "limit" in r.final_sql.lower()
    assert any("автоматически" in w.lower() for w in r.warnings)


def test_unbounded_ranking_sql_has_no_appended_limit() -> None:
    s = Settings(mock_mode=True, sql_enforce_global_column_whitelist=False, sql_result_fetch_unbounded=True)
    v = SQLValidatorService(s)
    sql = (
        "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM incity_orders a "
        "WHERE a.order_timestamp >= current_date - interval '7 day' "
        "GROUP BY 1 ORDER BY value DESC"
    )
    r = v.validate(sql, role_key="admin", intent="ranking")
    assert r.is_valid, r.errors
    assert " limit " not in r.final_sql.lower()
