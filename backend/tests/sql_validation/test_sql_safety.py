from __future__ import annotations

import unittest

from app.core.config import Settings
from app.services.security.sql_safety import collect_sql_mvp_safety_violations
from app.services.sql_validation.validator_service import SQLValidatorService


class SqlSafetyModuleTests(unittest.TestCase):
    def test_union_blocked_when_disabled(self) -> None:
        sql = "SELECT 1 AS x FROM train a LIMIT 1 UNION ALL SELECT 2 AS x FROM train a LIMIT 1"
        errs = collect_sql_mvp_safety_violations(sql, allow_union=False)
        self.assertTrue(any("UNION" in e for e in errs))

    def test_union_allowed_when_flag_on(self) -> None:
        sql = "SELECT 1 AS x FROM train a LIMIT 1 UNION ALL SELECT 2 AS x FROM train a LIMIT 1"
        self.assertEqual(collect_sql_mvp_safety_violations(sql, allow_union=True), [])

    def test_union_with_password_blocked_even_when_union_allowed(self) -> None:
        sql = "SELECT 1 AS x FROM train a LIMIT 1 UNION ALL SELECT password FROM train a LIMIT 1"
        errs = collect_sql_mvp_safety_violations(sql, allow_union=True)
        self.assertTrue(any("password" in e.lower() for e in errs))

    def test_comment_split_pattern(self) -> None:
        bad = "SELECT 1 FROM train a WHERE 1=1 /*hide*/; DROP TABLE train;"
        errs = collect_sql_mvp_safety_violations(bad, allow_union=True)
        self.assertTrue(any("comment" in e.lower() for e in errs))


class SqlSafetyValidatorIntegrationTests(unittest.TestCase):
    def test_validator_rejects_union_under_default_settings(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False, sql_allow_union=False))
        sql = "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM train a GROUP BY 1 LIMIT 5 UNION ALL SELECT 'x', 0 LIMIT 1"
        r = v.validate(sql, role_key="admin", intent="ranking")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("UNION" in e for e in r.errors))

    def test_validator_allows_union_when_configured(self) -> None:
        v = SQLValidatorService(Settings(mock_mode=True, sql_enforce_global_column_whitelist=False, sql_allow_union=True))
        sql = "SELECT a.city_id::text AS dim, COUNT(*) AS value FROM train a GROUP BY 1 LIMIT 5"
        r = v.validate(sql, role_key="admin", intent="ranking")
        self.assertTrue(r.is_valid, r.errors)


if __name__ == "__main__":
    unittest.main()
