"""
Интеграция NL pipeline (без живого Postgres при MOCK_MODE на executor):

prompt → intent → semantic → clarification → SQL → validate → execute(stub) → preview/chart.
"""

from __future__ import annotations

import uuid

import pytest

from app.core.config import Settings
from app.schemas.orchestration import OrchestrationInput
from app.services.llm.llm_service import LLMService
from app.services.orchestration.query_orchestrator import QueryOrchestrator
import app.services.orchestration.sql_execution_service as sql_exec_mod


@pytest.fixture
def sql_exec_mock_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    """Подмена settings у sql execution: stub-строки вместо Postgres."""
    monkeypatch.setattr(
        sql_exec_mod,
        "settings",
        Settings(
            mock_mode=True,
            sql_enforce_global_column_whitelist=False,
            sql_forbid_select_star=True,
        ),
    )


@pytest.fixture
def llm_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Детерминированные правила IntentService без LLM time_period вроде last_7_days."""
    disabled = LLMService(provider=None, temperature=0, max_tokens=1, timeout_seconds=1)
    monkeypatch.setattr("app.services.orchestration.query_orchestrator.get_llm_service", lambda: disabled)


@pytest.mark.integration
def test_nl_chain_prompt_through_validated_result(sql_exec_mock_mode: None, llm_disabled: None) -> None:
    orch = QueryOrchestrator()
    inp = OrchestrationInput(
        raw_query="топ 3 по количеству отменённых заказов за последние 7 дней",
        role_key="admin",
        notebook_context={},
        workspace_id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
    )
    out = orch.run(inp)
    # intent + интерпретация в trace
    assert out.intent == "ranking"
    assert out.effective_query
    structured = (out.trace_payload or {}).get("structured_interpretation") or {}
    assert structured.get("intent") == "ranking"

    assert out.execution_status == "succeeded", (out.execution_status, out.insight_text, out.validation_warnings)
    assert out.generated_sql.strip()
    assert (out.validated_sql or "").strip()
    assert out.sql_validation is not None
    assert out.sql_validation.is_valid
    assert out.rows_returned >= 1
    assert isinstance(out.result_preview, list)
    assert len(out.result_preview) >= 1
    assert out.chart.chart_type

    ht = (out.trace_payload or {}).get("human_trace") or {}
    assert isinstance(ht, dict)
    assert ht.get("question")
    assert "intent" in (ht.get("intent_explanation") or "").lower() or "«" in (ht.get("intent_explanation") or "")
    assert ht.get("metric_explanation")
    assert ht.get("sql_safety_explanation")
    assert "confidence" in ht
