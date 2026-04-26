from __future__ import annotations

import json

from app.services import analytics_pipeline as pipeline


def test_run_pipeline_returns_unified_contract(monkeypatch) -> None:
    monkeypatch.setattr(pipeline.settings, "ds_default_source_table", "public.incity_orders")

    def fake_analyze_natural_language(prompt: str, **_: object) -> pipeline.NaturalLanguageAnalysisResult:
        return pipeline.NaturalLanguageAnalysisResult(
            prompt=prompt,
            safe_sql="SELECT city_id, cancellations_total FROM public.incity_orders LIMIT 5",
            table_records=[
                {"city_id": 1, "cancellations_total": 12},
                {"city_id": 2, "cancellations_total": 10},
            ],
            chart_hint="Ranking по отменам",
            chart_type="bar",
            insight="Город 1 лидирует по отменам.",
            confidence=0.87,
            warnings=[],
            used_tables=["public.incity_orders"],
            used_columns=["city_id", "cancellations_total"],
            parsed={"intent": "ranking", "metric": "cancellations_total"},
            full_trace={
                "intent": "ranking",
                "chart": {
                    "recommended_chart_type": "bar",
                    "alternative_chart_types": ["table"],
                },
            },
            visualization={
                "recommended_chart_type": "bar",
                "alternative_chart_types": ["table"],
                "visualization_explanation": "Рейтинг лучше читается на bar chart.",
            },
            trace_summary="ranking · cancellations_total",
            execution_status="succeeded",
            resolved_source_table="public.incity_orders",
        )

    monkeypatch.setattr(pipeline, "analyze_natural_language", fake_analyze_natural_language)
    pipeline.MOCK_NOTEBOOK_CELLS.clear()

    response = pipeline.run_pipeline(
        notebook_id="contract-test-nb",
        prompt="Покажи топ-2 города по отменам",
    )

    assert response.notebook_id == "contract-test-nb"
    assert response.resolved_source_table == "public.incity_orders"
    assert response.question == "Покажи топ-2 города по отменам"
    assert response.interpreted_query
    assert "SELECT" in response.safe_sql
    assert response.insight
    assert 0.0 <= response.confidence <= 1.0

    assert isinstance(response.table, dict)
    assert response.table.get("columns") == ["city_id", "cancellations_total"]
    assert isinstance(response.table.get("rows"), list)
    assert len(response.table["rows"]) == 2

    assert isinstance(response.chart, dict)
    assert response.chart.get("recommendedChartType") in {"bar", "table", "line", "area", "pie", "geo_bubble", "heatmap"}

    cell_types = [c.type for c in response.cells]
    assert cell_types[:6] == ["prompt", "trace", "sql", "table", "chart", "insight"]

    table_cell = next(c for c in response.cells if c.type == "table")
    chart_cell = next(c for c in response.cells if c.type == "chart")
    trace_cell = next(c for c in response.cells if c.type == "trace")
    assert isinstance(table_cell.payload, dict)
    assert isinstance(chart_cell.payload, dict)
    assert isinstance(trace_cell.payload, dict)

    forecast_cell = next(c for c in response.cells if c.type == "forecast")
    fc_payload = json.loads(forecast_cell.content)
    assert fc_payload.get("schema_version") == 1
    assert "horizon" in fc_payload and "records" in fc_payload

    assert isinstance(response.insights, list)
    assert isinstance(response.forecast, dict)
    assert response.forecast.get("sufficient_data") is False
    assert "Недостаточно" in str(response.forecast.get("note_ru") or "")
    assert isinstance(response.anomalies, list)
