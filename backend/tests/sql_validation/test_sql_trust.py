from __future__ import annotations

import unittest

from app.core.config import Settings
from app.services.sql_validation.validator_service import SQLValidatorService
from app.services.sql_validation.sql_trust import estimate_window_days_from_sql
from app.services.sql_validation.utils import extract_from_join_tables, normalize_for_checks


class SqlTrustTests(unittest.TestCase):
    def test_schema_table_extracted(self) -> None:
        sql = normalize_for_checks(
            "SELECT COUNT(*) AS value FROM public.anonymized_incity_orders a WHERE a.city_id::text = '67'"
        )
        self.assertIn("anonymized_incity_orders", extract_from_join_tables(sql))

    def test_select_star_rejected_when_forbid(self) -> None:
        s = Settings(
            mock_mode=False,
            sql_forbid_select_star=True,
            sql_enforce_global_column_whitelist=False,
        )
        v = SQLValidatorService(s)
        r = v.validate("SELECT * FROM anonymized_incity_orders a LIMIT 10", role_key="admin", intent="ranking")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("SELECT *" in e for e in r.errors))

    def test_pg_sleep_rejected(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        r = v.validate(
            "SELECT 1 FROM anonymized_incity_orders a WHERE pg_sleep(1) IS NULL LIMIT 1",
            role_key="admin",
        )
        self.assertFalse(r.is_valid)

    def test_query_explanation_populated(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        sql = (
            "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM anonymized_incity_orders a "
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

    def test_sensitive_column_marketer_blocked(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=True))
        r = v.validate(
            "SELECT a.user_id FROM anonymized_incity_orders a LIMIT 1",
            role_key="marketer",
            intent="summary",
        )
        self.assertFalse(r.is_valid)
        self.assertTrue(any("user_id" in e.lower() for e in r.errors))

    def test_staging_upload_table_allowed(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False))
        sql = "SELECT 1 AS v FROM user_staging.t_aabbccddeeff u LIMIT 5"
        r = v.validate(sql, role_key="admin", intent="summary")
        self.assertTrue(r.is_valid, r.errors)

    def test_estimate_window_days_from_interval(self) -> None:
        sql = normalize_for_checks(
            "SELECT 1 FROM anonymized_incity_orders a WHERE a.order_timestamp >= current_date - interval '120 day'"
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
            "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM anonymized_incity_orders a "
            "WHERE a.order_timestamp::timestamp >= current_date - interval '7 day' "
            "GROUP BY 1 ORDER BY value DESC LIMIT 50"
        )
        r = v.validate(sql, role_key="admin", intent="ranking", entities={"window_days": 90})
        self.assertTrue(r.is_valid, r.errors)
        self.assertTrue(any("Период" in w for w in r.warnings))


if __name__ == "__main__":
    unittest.main()
