from __future__ import annotations

import unittest

from app.services.orchestration.chart_recommendation_service import ChartRecommendationService


class ChartRecommendationAxesTests(unittest.TestCase):
    def test_geo_signal_false_when_po_vsem_gorodam_substring_goroda(self) -> None:
        """«города» не должно срабатывать как гео из-за вхождения в «…городам»."""
        svc = ChartRecommendationService()
        q = (
            "качественная метрика по всем городам в разрезе дня за февраль 2025 "
            "количество заказов принятых по стартовой цене в течение 10 минут"
        )
        cols = ["bucket", "value"]
        rows = [{"bucket": "2025-02-01", "value": 1.0}, {"bucket": "2025-02-02", "value": 2.0}]
        rec = svc.recommend("trend", cols, rows, effective_query=q)
        self.assertEqual(rec.recommended_chart_type, "line")
        self.assertTrue(rec.geo_metadata is None or not rec.geo_metadata.geo_enabled)

    def test_line_recommendation_includes_axes_hint(self) -> None:
        svc = ChartRecommendationService()
        cols = ["bucket", "value"]
        rows = [{"bucket": "2024-01-01", "value": 1.0}, {"bucket": "2024-01-02", "value": 2.0}]
        rec = svc.recommend("trend", cols, rows, effective_query="динамика по дням")
        self.assertEqual(rec.recommended_chart_type, "line")
        self.assertTrue(rec.axes_hint.lower().startswith("ось"))
        self.assertIn("value", rec.series_keys)
