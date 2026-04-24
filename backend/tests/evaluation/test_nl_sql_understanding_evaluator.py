"""Golden NL→SQL Understanding dataset."""

from __future__ import annotations

import pytest

from app.services.evaluation.nl_sql_understanding_evaluator import (
    load_understanding_cases,
    run_nl_sql_understanding_evaluation,
)


def test_understanding_dataset_loads() -> None:
    cases = load_understanding_cases()
    assert len(cases) >= 30


@pytest.mark.parametrize("mode", ["deterministic", "mock"])
def test_understanding_run(mode: str) -> None:
    summary, results = run_nl_sql_understanding_evaluation(mode=mode)  # type: ignore[arg-type]
    assert summary.total_cases == len(results)
    assert summary.total_cases >= 30
    for name in ("overall_accuracy", "intent_accuracy", "metric_accuracy"):
        v = getattr(summary, name)
        assert 0.0 <= float(v) <= 1.0
