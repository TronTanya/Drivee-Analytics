from __future__ import annotations

import unittest

from app.services.orchestration.chart_recommendation_service import ChartRecommendationService


class ChartRecommendationAxesTests(unittest.TestCase):
    def test_line_recommendation_includes_axes_hint(self) -> None:
        svc = ChartRecommendationService()
        cols = ["bucket", "value"]
        rows = [{"bucket": "2024-01-01", "value": 1.0}, {"bucket": "2024-01-02", "value": 2.0}]
        rec = svc.recommend("trend", cols, rows, effective_query="динамика по дням")
        self.assertEqual(rec.recommended_chart_type, "line")
        self.assertTrue(rec.axes_hint.lower().startswith("ось"))
        self.assertIn("value", rec.series_keys)
