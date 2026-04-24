"""SQL Correctness suite: загрузка датасета и прогон."""

from __future__ import annotations

import pytest

from app.services.evaluation.sql_correctness_evaluator import (
    load_sql_correctness_cases,
    run_sql_correctness_evaluation,
)


def test_sql_correctness_dataset_loads() -> None:
    cases = load_sql_correctness_cases()
    assert len(cases) >= 4


@pytest.mark.parametrize("mode", ["mock", "deterministic"])
def test_sql_correctness_run_summary(mode: str) -> None:
    summary, results = run_sql_correctness_evaluation(mode=mode)  # type: ignore[arg-type]
    assert summary.total_cases == len(results)
    assert summary.total_cases >= 4
    for name in (
        "overall_accuracy",
        "fragment_pass_rate",
        "table_pass_rate",
        "gold_exact_pass_rate",
        "live_scalar_pass_rate",
        "live_scalar_coverage",
        "sql_validation_pass_rate",
    ):
        v = getattr(summary, name)
        assert 0.0 <= float(v) <= 1.0, name


@pytest.mark.parametrize("mode", ["mock", "deterministic"])
def test_sql_correctness_all_pass(mode: str) -> None:
    summary, results = run_sql_correctness_evaluation(mode=mode)  # type: ignore[arg-type]
    failed = [r for r in results if not r.passed]
    assert not failed, [f"{r.id}: {r.failure_reason}" for r in failed]
