from __future__ import annotations

from app.schemas.reporting import TemplateQuickRunResponse


def test_template_quick_run_response_has_explainability_fields() -> None:
    resp = TemplateQuickRunResponse(
        template_id="00000000-0000-0000-0000-000000000001",
        execution_status="succeeded",
        safe_sql="SELECT 1",
        insight="ok",
        chart_type="line",
        confidence=0.91,
        interpreted_intent="trend",
        trace_summary="NL->SQL pipeline completed",
        explainability_trace=["intent parsed", "metric mapped", "sql validated"],
    )
    assert resp.interpreted_intent == "trend"
    assert resp.trace_summary
    assert len(resp.explainability_trace) == 3


def test_template_quick_run_response_defaults_explainability_fields() -> None:
    resp = TemplateQuickRunResponse(
        template_id="00000000-0000-0000-0000-000000000002",
        execution_status="succeeded",
    )
    assert resp.interpreted_intent == ""
    assert resp.trace_summary == ""
    assert resp.explainability_trace == []
