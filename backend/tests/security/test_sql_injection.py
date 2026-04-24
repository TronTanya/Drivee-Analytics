"""Регрессии по классическим SQLi / multi-statement шаблонам для analytics SQL."""

from __future__ import annotations

import unittest

from app.core.config import Settings
from app.services.sql_validation.validator_service import SQLValidatorService


class SqlInjectionRegressionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.v = SQLValidatorService(
            Settings(
                mock_mode=True,
                sql_enforce_global_column_whitelist=False,
                sql_allow_union=False,
            )
        )

    def test_stacked_statements_rejected(self) -> None:
        sql = "SELECT 1 FROM train a LIMIT 1; DELETE FROM train WHERE 1=1;"
        r = self.v.validate(sql, role_key="admin", intent="summary")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("multiple" in e.lower() for e in r.errors))

    def test_union_injection_blocked(self) -> None:
        sql = (
            "SELECT a.city_id::text AS dim FROM train a LIMIT 5 "
            "UNION SELECT password FROM users LIMIT 5"
        )
        r = self.v.validate(sql, role_key="admin", intent="ranking")
        self.assertFalse(r.is_valid)
        self.assertTrue(any("union" in e.lower() for e in r.errors))

    def test_drop_in_comment_chain_flagged(self) -> None:
        sql = "SELECT 1 FROM train a WHERE 1=1 /*x*/; DROP TABLE train;"
        r = self.v.validate(sql, role_key="admin", intent="summary")
        self.assertFalse(r.is_valid)


if __name__ == "__main__":
    unittest.main()
