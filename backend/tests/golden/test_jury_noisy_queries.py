from __future__ import annotations

from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.sql_generation_service import SQLGenerationService


def test_noisy_cancellation_phrase_still_builds_month_city_sql() -> None:
    entities = IntentService(llm_service=None).extract_entities(
        "скока уникалные отмененые поездки пасажира после начяла поездки по месяцам и городам в 2026 году"
    )
    assert entities.get("metric_hint") == "unique_client_cancels_after_start"
    assert entities.get("calendar_year") == 2026
    assert entities.get("time_grain") == "month"
    assert "city_id" in (entities.get("dimensions") or [])


def test_wrong_layout_phrase_marks_normalization_and_funnel_sql() -> None:
    entities = IntentService(llm_service=None).extract_entities(
        "rfrfz rjydthbcbz d 2 'nfgf e gfcf;bhjd gj dctq ctnb pf b.,y 2025"
    )
    assert entities.get("funnel_two_stage_conversion") is True
    assert entities.get("metric_hint") == "acceptance_conversion"
    assert entities.get("metric_hint_secondary") == "completion_conversion"
    assert entities.get("input_normalization_note") == "detected_wrong_keyboard_layout_ru_en"
    sql = SQLGenerationService().generate(
        intent="summary",
        entities=entities,
        metric_sql="COUNT(*)",
        use_campaigns_only=False,
        workspace_id=None,
    ).lower()
    assert "acceptance_conversion" in sql
    assert "completion_conversion" in sql
