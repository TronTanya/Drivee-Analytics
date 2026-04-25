from __future__ import annotations

import uuid

from app.schemas.orchestration import OrchestrationInput
from app.services.llm.llm_service import LLMService
from app.services.orchestration.query_orchestrator import QueryOrchestrator


def test_orchestrator_blocks_entity_policy_and_exposes_trace(monkeypatch) -> None:
    disabled = LLMService(provider=None, temperature=0, max_tokens=1, timeout_seconds=1)
    monkeypatch.setattr("app.services.orchestration.query_orchestrator.get_llm_service", lambda: disabled)

    orch = QueryOrchestrator()
    monkeypatch.setattr(orch._intent, "extract_entities", lambda _q: {"user_id": "42"})
    inp = OrchestrationInput(
        raw_query="Покажи данные по пользователю 42",
        role_key="executive",
        notebook_context={},
        workspace_id=str(uuid.uuid4()),
        user_id=str(uuid.uuid4()),
    )
    out = orch.run(inp)

    assert out.execution_status == "failed"
    trace = out.trace_payload or {}
    guardrails = trace.get("guardrails") or {}
    assert guardrails.get("blocked") is True
    assert "entity_policy" in list(guardrails.get("codes") or [])
    messages = [str(m) for m in (guardrails.get("messages_ru") or [])]
    assert any("чувствительные сущности" in m.lower() for m in messages)

    ht = trace.get("human_trace") or {}
    assert isinstance(ht, dict)
    assert ht.get("guardrails_explanation")
    assert "блок" in (ht.get("sql_generation_explanation") or "").lower() or "политик" in (
        ht.get("sql_generation_explanation") or ""
    ).lower()
