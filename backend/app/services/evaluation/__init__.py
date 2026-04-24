"""Оценка качества NL→SQL (golden suite)."""

from app.services.evaluation.nl_sql_evaluator import (
    get_last_evaluation_summary,
    load_golden_cases,
    load_golden_cases_public,
    run_nl_sql_evaluation,
)

__all__ = [
    "get_last_evaluation_summary",
    "load_golden_cases",
    "load_golden_cases_public",
    "run_nl_sql_evaluation",
]
