"""Общие утилиты для evaluation suites (режимы без внешнего LLM, mock execution)."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator, Literal

from unittest.mock import patch

from app.core.config import settings
from app.services.llm.factory import get_llm_service
from app.services.llm.llm_service import LLMService
from app.services.orchestration import query_orchestrator as query_orchestrator_module

EvaluationMode = Literal["live", "mock", "deterministic"]

_DISABLED_LLM = LLMService(provider=None, temperature=0.1, max_tokens=64, timeout_seconds=5)


@contextmanager
def evaluation_runtime_context(mode: EvaluationMode) -> Iterator[None]:
    """Mock/deterministic: rules-first без внешнего LLM; Postgres может быть в mock_mode."""
    if mode == "live":
        yield
        return
    with (
        patch.object(settings, "deepseek_api_key", ""),
        patch.object(settings, "mock_mode", True),
        patch.object(settings, "guardrails_rate_limit_enabled", False),
        patch.object(query_orchestrator_module, "get_llm_service", return_value=_DISABLED_LLM),
    ):
        get_llm_service.cache_clear()
        try:
            yield
        finally:
            get_llm_service.cache_clear()


def trace_steps_from_full_trace(ft: dict) -> list[dict]:
    steps = ft.get("pipeline_steps")
    if not isinstance(steps, list):
        return []
    out: list[dict] = []
    for s in steps:
        if not isinstance(s, dict):
            continue
        name = str(s.get("name") or "step")
        ok = bool(s.get("ok", True))
        out.append({"step": name, "status": "passed" if ok else "failed", "detail": s.get("detail")})
    return out
