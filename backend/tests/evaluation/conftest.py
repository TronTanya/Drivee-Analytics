"""Evaluation: без внешнего LLM — только rules/mock SQL (быстрый CI)."""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.services.llm.factory import get_llm_service


@pytest.fixture(autouse=True)
def _evaluation_disable_external_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    get_llm_service.cache_clear()
    yield
    get_llm_service.cache_clear()
