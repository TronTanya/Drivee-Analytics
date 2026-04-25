"""Агрегированная проверка готовности демо (БД, словарь, guardrails, отчёты, eval-файл)."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal, engine
from app.models.user import User
from app.schemas.demo_readiness import DemoReadinessResponse
from app.services.semantic_layer.store import get_semantic_dictionary_store

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_EVAL_RESULTS = _BACKEND_ROOT / "evals" / "results" / "latest_eval_results.json"


def _weight(status: str) -> float:
    if status == "ok":
        return 1.0
    if status == "warn":
        return 0.75
    if status == "skipped":
        return 1.0
    return 0.0


def _aggregate_status(score: float, has_fail: bool, has_warn: bool) -> str:
    if has_fail or score < 0.5:
        return "not_ready"
    if has_warn or score < 0.9:
        return "degraded"
    return "ready"


def build_demo_readiness_response() -> DemoReadinessResponse:
    checks: dict[str, str] = {}

    checks["backend"] = "ok"

    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
        checks["database"] = "ok"
    except Exception as exc:  # noqa: BLE001
        logger.warning("demo_readiness database ping failed: %s", exc)
        checks["database"] = "fail"

    # Semantic dictionary (in-memory store)
    try:
        n = len(get_semantic_dictionary_store().list_public(query=None))
        checks["semantic_dictionary"] = "ok" if n > 0 else "warn"
    except Exception as exc:  # noqa: BLE001
        logger.warning("demo_readiness semantic_dictionary failed: %s", exc)
        checks["semantic_dictionary"] = "fail"

    # Guardrails / SQL policy knobs (always-on path for NL→SQL)
    try:
        if settings.sql_enforce_global_column_whitelist and settings.sql_forbid_select_star:
            checks["guardrails"] = "ok" if not settings.mock_mode else "warn"
        else:
            checks["guardrails"] = "warn"
    except Exception:  # noqa: BLE001
        checks["guardrails"] = "warn"

    # Reports & schedules — таблицы и минимальный ORM-доступ
    checks["reports"] = "skipped"
    checks["schedules"] = "skipped"
    checks["demo_user"] = "skipped"
    if db_ok:
        session: Session | None = None
        try:
            session = SessionLocal()
            session.execute(text("SELECT 1 FROM saved_reports LIMIT 1"))
            checks["reports"] = "ok"
        except Exception as exc:  # noqa: BLE001
            logger.info("demo_readiness reports table: %s", exc)
            checks["reports"] = "fail"
        try:
            if session is not None:
                session.execute(text("SELECT 1 FROM report_schedules LIMIT 1"))
                checks["schedules"] = "ok"
        except Exception as exc:  # noqa: BLE001
            logger.info("demo_readiness report_schedules table: %s", exc)
            checks["schedules"] = "fail" if checks["reports"] == "ok" else "warn"
        try:
            if session is not None:
                n_demo = session.scalar(select(func.count()).select_from(User).where(User.is_demo_user.is_(True)))
                if n_demo and int(n_demo) > 0:
                    checks["demo_user"] = "ok"
                else:
                    n_seed = session.scalar(
                        select(func.count()).select_from(User).where(User.email.like("%@drivee.local"))
                    )
                    checks["demo_user"] = "ok" if n_seed and int(n_seed) > 0 else "warn"
        except Exception as exc:  # noqa: BLE001
            logger.info("demo_readiness demo_user check: %s", exc)
            checks["demo_user"] = "warn"
        finally:
            if session is not None:
                session.close()

    # Eval JSON (golden last run)
    checks["eval_results"] = "warn"
    try:
        if _EVAL_RESULTS.is_file():
            raw: dict[str, Any] = json.loads(_EVAL_RESULTS.read_text(encoding="utf-8"))
            total = int(raw.get("total") or 0)
            cases = raw.get("cases")
            n_cases = len(cases) if isinstance(cases, list) else 0
            checks["eval_results"] = "ok" if total > 0 and n_cases > 0 else "warn"
        else:
            checks["eval_results"] = "warn"
    except Exception as exc:  # noqa: BLE001
        logger.info("demo_readiness eval_results: %s", exc)
        checks["eval_results"] = "fail"

    # Score: среднее по весам (все ключи из контракта)
    expected_keys = (
        "backend",
        "database",
        "semantic_dictionary",
        "guardrails",
        "reports",
        "schedules",
        "eval_results",
        "demo_user",
    )
    for k in expected_keys:
        checks.setdefault(k, "skipped")

    weights = [_weight(checks[k]) for k in expected_keys]
    score = round(sum(weights) / max(1, len(weights)), 4)

    has_fail = any(checks[k] == "fail" for k in expected_keys)
    has_warn = any(checks[k] == "warn" for k in expected_keys)
    status = _aggregate_status(score, has_fail, has_warn)

    return DemoReadinessResponse(status=status, checks={k: checks[k] for k in expected_keys}, score=score)
