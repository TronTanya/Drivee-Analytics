"""Quality Center aggregate + visualization + guardrails."""

from __future__ import annotations

import pytest

from app.services.evaluation.guardrails_safety_evaluator import load_guardrails_cases, run_guardrails_safety_evaluation
from app.services.evaluation.quality_center_service import run_full_quality_center
from app.services.evaluation.visualization_match_evaluator import load_visualization_cases, run_visualization_match_evaluation


def test_visualization_dataset() -> None:
    assert len(load_visualization_cases()) >= 20


def test_guardrails_dataset() -> None:
    assert len(load_guardrails_cases()) >= 20


@pytest.mark.parametrize("mode", ["deterministic", "mock"])
def test_visualization_run(mode: str) -> None:
    s, r = run_visualization_match_evaluation(mode=mode)  # type: ignore[arg-type]
    assert len(r) >= 20
    assert 0.0 <= s.overall_accuracy <= 1.0


@pytest.mark.parametrize("mode", ["deterministic", "mock"])
def test_guardrails_run(mode: str) -> None:
    s, r = run_guardrails_safety_evaluation(mode=mode)  # type: ignore[arg-type]
    assert len(r) >= 20
    assert 0.0 <= s.overall_accuracy <= 1.0


def test_quality_center_overview() -> None:
    o = run_full_quality_center("deterministic")
    assert o.overall_quality_score >= 0.0
    assert o.nl_sql_understanding.total_cases >= 30
