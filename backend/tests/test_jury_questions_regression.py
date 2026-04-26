from __future__ import annotations

import unittest
from typing import Any

from sqlalchemy import text

from app.db.session import engine
from app.services.analytics_pipeline import analyze_natural_language


class JuryQuestionsRegressionTests(unittest.TestCase):
    def _fetch_all(self, sql: str) -> list[dict[str, Any]]:
        with engine.connect() as conn:
            rows = conn.execute(text(sql)).mappings().all()
        return [dict(r) for r in rows]

    def _normalize_rows(self, rows: list[dict[str, Any]]) -> list[tuple[Any, ...]]:
        normalized: list[tuple[Any, ...]] = []
        for row in rows:
            normalized.append(tuple(row.get(k) for k in sorted(row.keys())))
        return sorted(normalized)

    def test_passenger_cancel_after_start_month_city_2026_matches_reference(self) -> None:
        question = (
            "Какое количество уникальных отмененных поездок со стороны пассажира "
            "после начала поездки было в разрезе месяца и города в 2026 году?"
        )
        reference_sql = """
            SELECT
              date_trunc('month', a.clientcancel_timestamp::timestamp) AS bucket,
              a.city_id::text AS dim,
              COUNT(
                DISTINCT CASE
                  WHEN a.clientcancel_timestamp IS NOT NULL
                   AND a.driverstarttheride_timestamp IS NOT NULL
                   AND a.clientcancel_timestamp > a.driverstarttheride_timestamp
                  THEN a.order_id
                END
              ) AS value
            FROM public.incity_orders a
            WHERE a.clientcancel_timestamp::timestamptz >= make_timestamptz(2026, 1, 1, 0, 0, 0, 'UTC')
              AND a.clientcancel_timestamp::timestamptz < make_timestamptz(2027, 1, 1, 0, 0, 0, 'UTC')
            GROUP BY 1, 2
            ORDER BY 1, 2
        """
        expected = self._fetch_all(reference_sql)

        result = analyze_natural_language(question, role_key="manager")
        sql = result.safe_sql.lower()
        self.assertIn("count(distinct", sql)
        self.assertIn("driverstarttheride_timestamp", sql)
        self.assertIn("clientcancel_timestamp", sql)
        self.assertIn("date_trunc('month'", sql)
        self.assertIn("a.city_id::text", sql)
        self.assertIn("make_timestamptz(2026, 1, 1", sql)
        self.assertGreaterEqual(result.confidence, 0.8)
        self.assertFalse(result.clarification_required)

        actual = list(result.table_records)
        self.assertEqual(self._normalize_rows(actual), self._normalize_rows(expected))

    def test_network_two_stage_conversion_june_2025_matches_reference(self) -> None:
        question = (
            "Какая конверсия составляет в два основных этапа у пассажиров: "
            "в принятие заказа и в завершении поездки по всей сети за июнь 2025 года?"
        )
        reference_sql = """
            SELECT
              COUNT(DISTINCT a.order_id)::bigint AS created_orders,
              COUNT(DISTINCT CASE WHEN a.driveraccept_timestamp IS NOT NULL THEN a.order_id END)::bigint AS accepted_orders,
              COUNT(DISTINCT CASE WHEN a.driverdone_timestamp IS NOT NULL THEN a.order_id END)::bigint AS completed_orders,
              ROUND(
                100.0 * COUNT(DISTINCT CASE WHEN a.driveraccept_timestamp IS NOT NULL THEN a.order_id END)
                / NULLIF(COUNT(DISTINCT a.order_id), 0), 2
              ) AS acceptance_conversion,
              ROUND(
                100.0 * COUNT(DISTINCT CASE WHEN a.driverdone_timestamp IS NOT NULL THEN a.order_id END)
                / NULLIF(COUNT(DISTINCT CASE WHEN a.driveraccept_timestamp IS NOT NULL THEN a.order_id END), 0), 2
              ) AS completion_conversion
            FROM public.incity_orders a
            WHERE a.order_timestamp::timestamptz >= make_timestamptz(2025, 6, 1, 0, 0, 0, 'UTC')
              AND a.order_timestamp::timestamptz < make_timestamptz(2025, 7, 1, 0, 0, 0, 'UTC')
        """
        expected = self._fetch_all(reference_sql)

        result = analyze_natural_language(question, role_key="manager")
        sql = result.safe_sql.lower()
        self.assertIn("acceptance_conversion", sql)
        self.assertIn("completion_conversion", sql)
        self.assertIn("nullif", sql)
        self.assertIn("round(", sql)
        self.assertIn("make_timestamptz(2025, 6, 1", sql)
        self.assertNotIn("group by", sql)
        self.assertGreaterEqual(result.confidence, 0.8)
        self.assertFalse(result.clarification_required)

        trace = dict(result.full_trace or {})
        assumptions = trace.get("assumptions") or []
        self.assertTrue(any("принятых заказов" in str(x) for x in assumptions))

        actual = list(result.table_records)
        self.assertEqual(self._normalize_rows(actual), self._normalize_rows(expected))


if __name__ == "__main__":
    unittest.main()
