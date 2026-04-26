from __future__ import annotations

from datetime import datetime

from app.schemas.orchestration import (
    AmbiguityPayload,
    ChartRecommendation,
    OrchestrationOutput,
)
from app.services.orchestration.query_orchestrator import attach_interpretation_and_trace


def test_trace_contains_input_normalization_summary_ru() -> None:
    out = OrchestrationOutput(
        preprocessed_query="rfrfz rjydthbcbz",
        effective_query="rfrfz rjydthbcbz",
        intent="summary",
        entities={"input_normalization_note": "detected_wrong_keyboard_layout_ru_en"},
        ambiguity=AmbiguityPayload(),
        confidence_score=0.81,
        generated_sql="",
        validated_sql="",
        execution_status="clarification_required",
        chart=ChartRecommendation(chart_type="table", rationale=""),
        trace_payload={},
        pipeline_steps=[],
        started_at=datetime.utcnow(),
        finished_at=datetime.utcnow(),
    )
    patched = attach_interpretation_and_trace(out)
    interp = dict((patched.trace_payload or {}).get("interpretation") or {})
    msg = str(interp.get("input_normalization_summary_ru") or "")
    assert "раскладки" in msg.lower()
