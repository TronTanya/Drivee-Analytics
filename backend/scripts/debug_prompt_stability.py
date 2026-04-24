#!/usr/bin/env python3
"""CLI: prompt stability debug (N runs, deterministic/mock/live)."""

from __future__ import annotations

import argparse
import json

from app.schemas.evaluation_drivee_quality import PromptStabilityRequest
from app.services.evaluation.prompt_stability_service import run_prompt_stability


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--prompt", required=True)
    p.add_argument("--runs", type=int, default=5)
    p.add_argument("--mode", default="deterministic", choices=["deterministic", "mock", "live"])
    args = p.parse_args()
    res = run_prompt_stability(
        PromptStabilityRequest(prompt=args.prompt, runs=args.runs, mode=args.mode)  # type: ignore[arg-type]
    )
    print(json.dumps(res.model_dump(mode="json"), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
