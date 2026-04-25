from __future__ import annotations

import unittest

from app.core.config import Settings
from app.services.sql_validation.validator_service import SQLValidatorService
from app.services.sql_validation.sql_trust import estimate_window_days_from_sql
from app.services.sql_validation.utils import extract_from_join_tables, normalize_for_checks


class SqlTrustTests(unittest.TestCase):
    def test_schema_table_extracted(self) -> None:
        sql = normalize_for_checks(
            "SELECT COUNT(*) AS value FROM public.train a WHERE a.city_id::text = '67'"
        )
        self.assertIn("train", extract_from_join_tables(sql))

    def test_select_star_rejected_when_forbid(self) -> None:
        s = Settings(
            mock_mode=False,
            sql_forbid_select_star=True,
            sql_enforce_global_column_whitelist=False,
        )
        v = SQLValidatorService(s)
        r = v.validate("SELECT * FROM train a LIMIT 10", role_key="admin", intent="ranking")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("SELECT *" in e for e in r.errors))

    def test_pg_sleep_rejected(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        r = v.validate(
            "SELECT 1 FROM train a WHERE pg_sleep(1) IS NULL LIMIT 1",
            role_key="admin",
        )
        self.assertFalse(r.is_valid)
        self.assertEqual(r.guardrail_explainability.get("decision"), "rejected")

    def test_query_explanation_populated(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        sql = (
            "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM train a "
            "WHERE a.order_timestamp::timestamp >= current_date - interval '7 day' "
            "GROUP BY 1 ORDER BY value DESC LIMIT 5"
        )
        r = v.validate(sql, role_key="admin", intent="ranking", entities={"canonical_metric_key": "orders_count"})
        self.assertTrue(r.is_valid)
        self.assertIn("tables_used", r.query_explanation)
        self.assertIn("complexity_score", r.preview_assessment)
        self.assertGreaterEqual(r.preview_assessment.get("complexity_score", 0), 0)

    def test_disallowed_schema_rejected(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        r = v.validate("SELECT 1 FROM evil.orders o LIMIT 1", role_key="admin", intent="summary")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("Схема" in e for e in r.errors))

    def test_forbidden_mutation_verbs_rejected(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        bad = [
            "DELETE FROM train",
            "UPDATE train SET city_id='1'",
            "DROP TABLE train",
            "ALTER TABLE train ADD COLUMN x int",
            "TRUNCATE TABLE train",
        ]
        for sql in bad:
            r = v.validate(sql, role_key="admin", intent="summary")
            self.assertFalse(r.is_valid)
            self.assertEqual(r.guardrail_explainability.get("decision"), "rejected")

    def test_union_with_system_catalog_rejected(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        sql = (
            "SELECT a.city_id::text AS dim FROM train a "
            "UNION SELECT table_name FROM information_schema.tables LIMIT 5"
        )
        r = v.validate(sql, role_key="admin", intent="comparison")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("UNION" in e for e in r.errors))

    def test_sql_comment_injection_pattern_rejected(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        sql = "SELECT a.city_id FROM train a -- bypass\n LIMIT 5"
        r = v.validate(sql, role_key="admin", intent="ranking")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("комментарий" in e.lower() for e in r.errors))

    def test_explainability_block_present_for_allowed_sql(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        sql = "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM train a GROUP BY 1 LIMIT 5"
        r = v.validate(sql, role_key="admin", intent="ranking")
        self.assertTrue(r.is_valid, r.errors)
        self.assertEqual(r.guardrail_explainability.get("decision"), "allowed")
        self.assertIn("triggered_rules", r.guardrail_explainability)

    def test_sensitive_column_marketer_blocked(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=True))
        r = v.validate(
            "SELECT a.user_id FROM train a LIMIT 1",
            role_key="marketer",
            intent="summary",
        )
        self.assertFalse(r.is_valid)
        self.assertTrue(any("user_id" in e.lower() for e in r.errors))

    def test_multiple_statements_rejected_with_explainability(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        r = v.validate("SELECT 1; SELECT 2", role_key="admin", intent="summary")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("Multiple SQL statements" in e for e in r.errors))
        self.assertEqual(r.guardrail_explainability.get("decision"), "rejected")
        self.assertIn("single_statement_only", r.guardrail_explainability.get("triggered_rules", []))

    def test_staging_upload_table_allowed(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        sql = "SELECT 1 AS v FROM user_staging.t_aabbccddeeff u LIMIT 5"
        r = v.validate(sql, role_key="admin", intent="summary")
        self.assertTrue(r.is_valid, r.errors)

    def test_estimate_window_days_from_interval(self) -> None:
        sql = normalize_for_checks(
            "SELECT 1 FROM train a WHERE a.order_timestamp >= current_date - interval '120 day'"
        )
        self.assertEqual(estimate_window_days_from_sql(sql), 120)

    def test_performance_warnings_on_wide_window_entity(self) -> None:
        s = Settings(
            mock_mode=True,
            sql_enforce_global_column_whitelist=False,
            sql_warn_scan_period_days=14,
            sql_sample_complexity_score_min=99,
        )
        v = SQLValidatorService(s)
        sql = (
            "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM train a "
            "WHERE a.order_timestamp::timestamp >= current_date - interval '7 day' "
            "GROUP BY 1 ORDER BY value DESC LIMIT 50"
        )
        r = v.validate(sql, role_key="admin", intent="ranking", entities={"window_days": 90})
        self.assertTrue(r.is_valid, r.errors)
        self.assertTrue(any("Период" in w for w in r.warnings))

    def test_information_schema_blocked_explicit_message(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        sql = "SELECT 1 FROM public.train a JOIN information_schema.tables t ON 1=1 LIMIT 1"
        r = v.validate(sql, role_key="admin", intent="summary")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("information_schema" in e.lower() for e in r.errors))

    def test_password_column_blocked_even_for_admin(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        r = v.validate(
            "SELECT a.password FROM train a LIMIT 1",
            role_key="admin",
            intent="summary",
        )
        self.assertFalse(r.is_valid)
        self.assertTrue(any("password" in e.lower() for e in r.errors))

    def test_rejected_sql_reason_summary_ru_uses_primary_error(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        r = v.validate("DELETE FROM train", role_key="admin", intent="summary")
        self.assertFalse(r.is_valid)
        rs = str(r.guardrail_explainability.get("reason_summary_ru") or "")
        self.assertTrue(rs.startswith("SQL отклонён:"))


if __name__ == "__main__":
    unittest.main()
