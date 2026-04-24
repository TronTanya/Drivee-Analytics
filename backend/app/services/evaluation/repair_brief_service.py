"""Сохранение артефактов прогона Quality Center и markdown repair brief."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parent.parent.parent
RUNS = ROOT / "app" / "evals" / "runs"


def get_latest_repair_brief() -> dict[str, Any] | None:
    """Последний каталог прогона с repair_brief.md (если есть)."""
    if not RUNS.is_dir():
        return None
    dirs = sorted((p for p in RUNS.iterdir() if p.is_dir()), key=lambda p: p.name, reverse=True)
    for d in dirs:
        md_path = d / "repair_brief.md"
        if not md_path.is_file():
            continue
        summary_path = d / "summary.json"
        overall: float | None = None
        if summary_path.is_file():
            try:
                data = json.loads(summary_path.read_text(encoding="utf-8"))
                overall = float(data.get("overall_quality_score") or 0.0)
            except (json.JSONDecodeError, TypeError, ValueError):
                overall = None
        return {
            "run_id": d.name,
            "repair_brief_md": md_path.read_text(encoding="utf-8"),
            "overall_quality_score": overall,
        }
    return None


def _cluster(reason: str) -> str:
    r = (reason or "").lower()
    if "time_range" in r or "time range" in r:
        return "time_filter_mismatch"
    if "metric" in r:
        return "metric_mismatch"
    if "chart" in r:
        return "wrong_chart_type"
    if "clarification" in r:
        return "clarification_missing_or_wrong"
    if "sql" in r or "validation" in r:
        return "sql_or_validation"
    if "guardrail" in r or "execution" in r or "blocked" in r:
        return "guardrail_or_execution"
    if "result_shape" in r:
        return "result_shape_mismatch"
    return "other"


def write_quality_run_bundle(
    *,
    overview: dict[str, Any],
    failing_cases: list[dict[str, Any]],
    all_case_results: dict[str, list[dict[str, Any]]],
) -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out = RUNS / ts
    out.mkdir(parents=True, exist_ok=True)
    (out / "summary.json").write_text(json.dumps(overview, ensure_ascii=False, indent=2), encoding="utf-8")
    flat: list[dict[str, Any]] = []
    for suite, rows in all_case_results.items():
        for row in rows:
            flat.append({"suite": suite, **row})
    (out / "results.json").write_text(json.dumps(flat, ensure_ascii=False, indent=2), encoding="utf-8")
    (out / "failing_cases.json").write_text(json.dumps(failing_cases, ensure_ascii=False, indent=2), encoding="utf-8")

    clusters: dict[str, list[str]] = {}
    for fc in failing_cases:
        key = _cluster(str(fc.get("failure_reason") or ""))
        clusters.setdefault(key, []).append(str(fc.get("id")))

    overall = float(overview.get("overall_quality_score") or 0.0)
    lines = [
        "# Drivee Quality Center — Repair Brief",
        "",
        f"- Timestamp: `{ts}`",
        f"- Overall quality score: **{overall:.2f}**",
        "",
        "## Failed case clusters",
        "",
    ]
    for k, ids in sorted(clusters.items(), key=lambda kv: -len(kv[1])):
        lines.append(f"### {k} ({len(ids)} cases)")
        for i in ids[:40]:
            lines.append(f"- `{i}`")
        if len(ids) > 40:
            lines.append(f"- … +{len(ids) - 40} more")
        lines.append("")
    lines += [
        "## Recommendations",
        "",
        "- Проверьте `semantic_dictionary.json` и алиасы периодов при кластерах **time_filter_mismatch**.",
        "- Уточните `SemanticParser` / intent rules при **metric_mismatch**.",
        "- Обновите `chart_recommendation_service.py` при **wrong_chart_type**.",
        "- Расширьте `ClarificationEngine` при **clarification_missing_or_wrong**.",
        "- Проверьте `SQLValidatorService` и `policy_engine.py` при **sql_or_validation** / **guardrail_or_execution**.",
        "",
    ]
    (out / "repair_brief.md").write_text("\n".join(lines), encoding="utf-8")
    return out


def collect_failing_from_results(results: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in results:
        if r.get("passed") is True:
            continue
        out.append(
            {
                "id": r.get("id"),
                "suite": r.get("suite"),
                "failure_reason": r.get("failure_reason"),
                "prompt": r.get("prompt"),
            }
        )
    return out
