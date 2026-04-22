from __future__ import annotations

import unittest

import pandas as pd

from app.services.ds.metrics_forecast import assess_series_quality, build_daily_metrics_for_forecast


class ForecastQualityTests(unittest.TestCase):
    def test_marks_short_history_as_baseline_only(self) -> None:
        idx = pd.date_range("2026-01-01", periods=7, freq="D", tz="UTC")
        series = pd.Series([10, 11, 9, 12, 10, 8, 7], index=idx)
        quality = assess_series_quality(series)
        self.assertTrue(quality["baseline_only"])
        self.assertIn("short_history", quality["reasons"])

    def test_marks_good_history_as_not_baseline_only(self) -> None:
        idx = pd.date_range("2026-01-01", periods=40, freq="D", tz="UTC")
        series = pd.Series([100 + (i % 5) for i in range(40)], index=idx)
        quality = assess_series_quality(series)
        self.assertFalse(quality["baseline_only"])
        self.assertEqual(quality["reasons"], [])

    def test_daily_metric_aggregation_uses_events_not_id_sums(self) -> None:
        df = pd.DataFrame(
            {
                "order_timestamp": [
                    "2026-01-01T08:00:00Z",
                    "2026-01-01T09:00:00Z",
                    "2026-01-01T09:30:00Z",
                    "2026-01-02T10:00:00Z",
                ],
                "order_id": [101, 102, 104, 103],
                "driverdone_timestamp": [
                    "2026-01-01T08:30:00Z",
                    None,
                    None,
                    "2026-01-02T10:40:00Z",
                ],
                # Third row has both cancellation timestamps to verify no double counting.
                "clientcancel_timestamp": [None, "2026-01-01T09:20:00Z", "2026-01-01T09:40:00Z", None],
                "drivercancel_timestamp": [None, None, "2026-01-01T09:45:00Z", "2026-01-02T10:25:00Z"],
                "price_order_local": [100.0, 200.0, 50.0, 300.0],
            }
        )
        semantic_map = {
            "date": "order_timestamp",
            "orders_count": "order_id",
            "done_rides": "driverdone_timestamp",
            "client_cancellations": "clientcancel_timestamp",
            "driver_cancellations": "drivercancel_timestamp",
            "cancellations_total": "clientcancel_timestamp",
            "sum_order_price": "price_order_local",
        }

        series_map, resolved_date_col = build_daily_metrics_for_forecast(df, semantic_map)
        self.assertEqual(resolved_date_col, "order_timestamp")

        self.assertIn("orders_count", series_map)
        self.assertIn("done_rides", series_map)
        self.assertIn("cancellations_total", series_map)
        self.assertIn("sum_order_price", series_map)

        # orders_count must be per-day distinct order count, not order_id sum.
        self.assertEqual(float(series_map["orders_count"].iloc[0]), 3.0)
        self.assertEqual(float(series_map["orders_count"].iloc[1]), 1.0)

        # done_rides must count completion events.
        self.assertEqual(float(series_map["done_rides"].iloc[0]), 1.0)
        self.assertEqual(float(series_map["done_rides"].iloc[1]), 1.0)

        # cancellations_total must count cancelled rows (not double count when both timestamps are present).
        self.assertEqual(float(series_map["cancellations_total"].iloc[0]), 2.0)
        self.assertEqual(float(series_map["cancellations_total"].iloc[1]), 1.0)

        # sum_order_price remains numeric sum.
        self.assertEqual(float(series_map["sum_order_price"].iloc[0]), 350.0)
        self.assertEqual(float(series_map["sum_order_price"].iloc[1]), 300.0)


if __name__ == "__main__":
    unittest.main()
