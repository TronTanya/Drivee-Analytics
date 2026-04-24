#!/usr/bin/env python3
"""CLI: прогон Quality Center suites с опциональным fail-under threshold."""

from __future__ import annotations

import argparse
import sys

from app.schemas.evaluation_nl_sql import EvaluationMode
from app.services.evaluation.guardrails_safety_evaluator import run_guardrails_safety_evaluation
from app.services.evaluation.nl_sql_understanding_evaluator import run_nl_sql_understanding_evaluation
from app.services.evaluation.quality_center_service import run_full_quality_center
from app.services.evaluation.sql_correctness_evaluator import run_sql_correctness_evaluation
from app.services.evaluation.visualization_match_evaluator import run_visualization_match_evaluation


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--suite", default="all", choices=["all", "understanding", "sql", "visualization", "guardrails"])
    p.add_argument("--mode", default="deterministic", choices=["deterministic", "mock", "live"])
    p.add_argument("--fail-under", type=float, default=None)
    p.add_argument("--output", default="", help="ignored; repair bundle пишется из API POST /evaluation/quality/run")
    args = p.parse_args()
    mode: EvaluationMode = args.mode  # type: ignore[assignment]

    if args.suite == "all":
        overview = run_full_quality_center(mode=mode)
        score = overview.overall_quality_score
        print(overview.model_dump_json())
    elif args.suite == "understanding":
        s, _ = run_nl_sql_understanding_evaluation(mode)
        score = s.overall_accuracy
        print(s.model_dump_json())
    elif args.suite == "sql":
        s, _ = run_sql_correctness_evaluation(mode)
        score = s.overall_accuracy
        print(s.model_dump_json())
    elif args.suite == "visualization":
        s, _ = run_visualization_match_evaluation(mode)
        score = s.overall_accuracy
        print(s.model_dump_json())
    else:
        s, _ = run_guardrails_safety_evaluation(mode)
        score = s.overall_accuracy
        print(s.model_dump_json())

    if args.fail_under is not None and score < float(args.fail_under):
        print(
            f"Quality score {score:.2f} is below threshold {float(args.fail_under):.2f}",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
