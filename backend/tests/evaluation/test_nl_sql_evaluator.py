"""Golden NL→SQL evaluator: загрузка датасета и сводка метрик."""

from __future__ import annotations

import pytest
from pydantic import TypeAdapter

from app.schemas.evaluation_nl_sql import GoldenCase
from app.services.evaluation.nl_sql_evaluator import (
    load_golden_cases,
    run_nl_sql_evaluation,
)


def test_golden_dataset_loads() -> None:
    cases = load_golden_cases()
    assert len(cases) >= 30


def test_golden_cases_required_fields() -> None:
    for c in load_golden_cases():
        assert c.id
        assert c.category
        assert c.prompt.strip()
        assert c.role
        assert c.expected is not None


@pytest.mark.parametrize("mode", ["mock", "deterministic"])
def test_evaluator_produces_summary(mode: str) -> None:
    summary, results = run_nl_sql_evaluation(mode=mode)  # type: ignore[arg-type]
    assert summary.total_cases == len(results)
    assert summary.total_cases >= 30
    for name in (
        "overall_accuracy",
        "intent_accuracy",
        "metric_accuracy",
        "dimension_accuracy",
        "time_range_accuracy",
        "chart_accuracy",
        "clarification_accuracy",
        "guardrail_accuracy",
        "sql_validation_pass_rate",
        "confidence_average",
    ):
        v = getattr(summary, name)
        assert 0.0 <= float(v) <= 1.0, name


def test_guardrail_cases_do_not_execute() -> None:
    _, results = run_nl_sql_evaluation(mode="mock")
    for r in results:
        if r.category != "guardrail":
            continue
        assert r.actual.get("should_execute") is False
        sql = str(r.actual.get("sql") or "").upper()
        assert "DROP" not in sql
        assert "DELETE" not in sql


def test_clarification_cases_require_clarification() -> None:
    _, results = run_nl_sql_evaluation(mode="mock")
    for r in results:
        if r.category != "clarification":
            continue
        assert r.actual.get("requires_clarification") is True, r.id


def test_golden_model_roundtrip() -> None:
    raw = load_golden_cases()
    ta = TypeAdapter(list[GoldenCase])
    dumped = ta.dump_python(raw, mode="json")
    back = ta.validate_python(dumped)
    assert len(back) == len(raw)
