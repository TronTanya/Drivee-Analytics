"""Одна строка с несколькими числовыми колонками — payload графика «тает» в категории + значение."""

from __future__ import annotations

from app.services.analytics_pipeline import NaturalLanguageAnalysisResult, _build_chart_cell_payload


def test_bar_payload_melts_single_row_accept_cancel_columns() -> None:
    result = NaturalLanguageAnalysisResult(
        prompt="q",
        safe_sql="SELECT 1",
        table_records=[{"accepted_rows": 9048, "cancelled_rows": 270}],
        visualization={"recommended_chart_type": "bar", "alternative_chart_types": ["table"]},
    )
    payload = _build_chart_cell_payload(result)
    assert payload["chartType"] == "bar"
    assert payload["xKey"] == "_metric_label"
    assert payload["series"] == [{"key": "_metric_value", "name": "Значение"}]
    assert len(payload["data"]) == 2
    labels = [r["_metric_label"] for r in payload["data"]]
    assert any("Принят" in lab for lab in labels)
    assert any("Отмен" in lab for lab in labels)
    values = sorted(int(r["_metric_value"]) for r in payload["data"])
    assert values == [270, 9048]


def test_horizontal_bar_payload_melts_same_shape() -> None:
    result = NaturalLanguageAnalysisResult(
        prompt="q",
        safe_sql="SELECT 1",
        table_records=[{"accepted_rows": 1, "cancelled_rows": 2}],
        visualization={"recommended_chart_type": "horizontal_bar"},
    )
    payload = _build_chart_cell_payload(result)
    assert payload["chartType"] == "horizontal_bar"
    assert payload["xKey"] == "_metric_label"
    assert len(payload["data"]) == 2
