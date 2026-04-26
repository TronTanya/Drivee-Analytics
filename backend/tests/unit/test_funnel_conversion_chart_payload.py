from __future__ import annotations

import unittest
from decimal import Decimal

from app.services.analytics_pipeline import NaturalLanguageAnalysisResult, _build_chart_cell_payload


class FunnelConversionChartPayloadTests(unittest.TestCase):
    def test_two_stage_conversions_yield_two_bar_points(self) -> None:
        """Одна строка с acceptance/completion conversion → два столбца, не один donut-ломаный ряд."""
        result = NaturalLanguageAnalysisResult(
            prompt="конверсия",
            safe_sql="SELECT 1",
            table_records=[
                {
                    "created_orders": 64384,
                    "accepted_orders": 59766,
                    "completed_orders": 57690,
                    "acceptance_conversion": Decimal("92.83"),
                    "completion_conversion": Decimal("96.53"),
                }
            ],
            chart_type="donut",
            visualization={
                "recommended_chart_type": "donut",
                "alternative_chart_types": ["bar", "horizontal_bar", "table"],
            },
        )
        out = _build_chart_cell_payload(result)
        self.assertEqual(out.get("chartType"), "bar")
        self.assertEqual(out.get("xKey"), "_metric_label")
        data = out.get("data") or []
        self.assertEqual(len(data), 2)
        self.assertAlmostEqual(float(data[0]["_metric_value"]), 92.83, places=2)
        self.assertAlmostEqual(float(data[1]["_metric_value"]), 96.53, places=2)


if __name__ == "__main__":
    unittest.main()
