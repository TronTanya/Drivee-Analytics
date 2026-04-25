from __future__ import annotations

from app.schemas.orchestration import ChartRecommendation, OrchestrationOutput
from app.services.orchestration.human_trace import build_human_trace_ru


def test_build_human_trace_ru_contains_explainability_sections() -> None:
    output = OrchestrationOutput(
        preprocessed_query="Покажи выручку по городам за неделю",
        effective_query="Покажи выручку по городам за неделю",
        intent="comparison",
        confidence_score=0.91,
        chart=ChartRecommendation(chart_type="bar", rationale="Сравнение категорий"),
        generated_sql="SELECT city_id, SUM(price_order_local) FROM incity_orders GROUP BY city_id",
        validated_sql="SELECT city_id, SUM(price_order_local) FROM incity_orders GROUP BY city_id LIMIT 100",
        execution_status="succeeded",
    )
    trace_payload = {
        "effective_query": "Покажи выручку по городам за неделю",
        "intent": "comparison",
        "structured_interpretation": {
            "intent": "comparison",
            "dimensions": ["city_id"],
            "grouping": ["city_id"],
            "time_range": {"preset": "last_week", "label_ru": "последняя неделя"},
        },
        "semantic_terms": [
            {
                "surface_form": "выручка",
                "term_key": "sum_order_price",
                "sql_fragment": "SUM(a.price_order_local)",
            }
        ],
        "chart": {"chart_type": "bar", "rationale": "Сравнение городов"},
        "sql_validation": {
            "guardrail_explainability": {
                "decision": "allowed",
                "reason_summary_ru": "SQL разрешён.",
                "policy_snapshot": {"select_only": True, "table_whitelist_enabled": True},
            }
        },
    }

    human = build_human_trace_ru(trace_payload=trace_payload, output=output)
    for key in (
        "intent_explanation",
        "metric_explanation",
        "grouping_explanation",
        "period_explanation",
        "chart_explanation",
        "sql_safety_explanation",
    ):
        assert key in human
        assert str(human[key]).strip()
    assert float(human.get("confidence", 0.0)) > 0.0
