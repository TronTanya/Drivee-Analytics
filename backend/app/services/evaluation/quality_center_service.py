"""Агрегация сводок Drivee Quality Center."""

from __future__ import annotations

from typing import Any, Optional

from app.schemas.evaluation_drivee_quality import QualityCenterOverview, QualitySuiteSummary
from app.schemas.evaluation_nl_sql import EvaluationMode
from app.services.evaluation.guardrails_safety_evaluator import run_guardrails_safety_evaluation
from app.services.evaluation.nl_sql_understanding_evaluator import run_nl_sql_understanding_evaluation
from app.services.evaluation.sql_correctness_evaluator import run_sql_correctness_evaluation
from app.services.evaluation.visualization_match_evaluator import run_visualization_match_evaluation

_LAST_OVERVIEW: Optional[QualityCenterOverview] = None


def get_last_quality_center_overview() -> Optional[QualityCenterOverview]:
    return _LAST_OVERVIEW


def _suite(name: str, acc: float, n: int, p: int, mode: EvaluationMode, **extra: Any) -> QualitySuiteSummary:
    return QualitySuiteSummary(
        suite=name,
        total_cases=n,
        passed_cases=p,
        overall_accuracy=acc,
        mode=mode,
        extra=extra,
    )


def run_full_quality_center(mode: EvaluationMode = "deterministic") -> QualityCenterOverview:
    global _LAST_OVERVIEW
    u_sum, u_res = run_nl_sql_understanding_evaluation(mode)
    s_sum, s_res = run_sql_correctness_evaluation(mode)
    v_sum, v_res = run_visualization_match_evaluation(mode)
    g_sum, g_res = run_guardrails_safety_evaluation(mode)
    scores = [u_sum.overall_accuracy, s_sum.overall_accuracy, v_sum.overall_accuracy, g_sum.overall_accuracy]
    overall = round(sum(scores) / max(1, len(scores)), 4)
    from app.schemas.evaluation_nl_sql import utc_now_iso

    overview = QualityCenterOverview(
        overall_quality_score=overall,
        nl_sql_understanding=_suite(
            "understanding",
            u_sum.overall_accuracy,
            u_sum.total_cases,
            u_sum.passed_cases,
            mode,
            summary=u_sum.model_dump(),
        ),
        sql_correctness=_suite(
            "sql_correctness",
            s_sum.overall_accuracy,
            s_sum.total_cases,
            s_sum.passed_cases,
            mode,
            summary=s_sum.model_dump(),
        ),
        visualization_match=_suite(
            "visualization",
            v_sum.overall_accuracy,
            v_sum.total_cases,
            v_sum.passed_cases,
            mode,
            summary=v_sum.model_dump(),
        ),
        guardrails_safety=_suite(
            "guardrails",
            g_sum.overall_accuracy,
            g_sum.total_cases,
            g_sum.passed_cases,
            mode,
            summary=g_sum.model_dump(),
        ),
        updated_at=utc_now_iso(),
        mode=mode,
    )
    _LAST_OVERVIEW = overview
    return overview


def get_last_run_artifacts() -> dict[str, Any]:
    """Зарезервировано: последний repair brief path (после repair_brief_service)."""
    return {}


def build_quality_last_run_bundle(mode: EvaluationMode = "deterministic") -> dict[str, Any]:
    """Кэшированные результаты последнего suite-прогона; при пустом кэше — один прогон."""
    from app.services.evaluation.guardrails_safety_evaluator import get_last_guardrails_summary, run_guardrails_safety_evaluation
    from app.services.evaluation.nl_sql_understanding_evaluator import get_last_understanding_summary, run_nl_sql_understanding_evaluation
    from app.services.evaluation.sql_correctness_evaluator import get_last_sql_correctness_summary, run_sql_correctness_evaluation
    from app.services.evaluation.visualization_match_evaluator import get_last_visualization_summary, run_visualization_match_evaluation

    us, ur = get_last_understanding_summary()
    if not ur:
        us, ur = run_nl_sql_understanding_evaluation(mode)
    ss, sr = get_last_sql_correctness_summary()
    if not sr:
        ss, sr = run_sql_correctness_evaluation(mode)
    vs, vr = get_last_visualization_summary()
    if not vr:
        vs, vr = run_visualization_match_evaluation(mode)
    gs, gr = get_last_guardrails_summary()
    if not gr:
        gs, gr = run_guardrails_safety_evaluation(mode)

    def dump_cases(rows: list[Any]) -> list[dict[str, Any]]:
        return [r.model_dump(mode="json") for r in rows]  # type: ignore[attr-defined]

    return {
        "mode": mode,
        "understanding": {"summary": us.model_dump(mode="json"), "case_results": dump_cases(ur)} if us else None,
        "sql_correctness": {"summary": ss.model_dump(mode="json"), "case_results": dump_cases(sr)} if ss else None,
        "visualization": {"summary": vs.model_dump(mode="json"), "case_results": dump_cases(vr)} if vs else None,
        "guardrails": {"summary": gs.model_dump(mode="json"), "case_results": dump_cases(gr)} if gs else None,
    }
