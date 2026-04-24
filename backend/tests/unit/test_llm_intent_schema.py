"""LLMQueryInterpretation: нормализация intent без падения Pydantic (см. app/schemas/llm.py)."""

from __future__ import annotations

import pytest

from app.schemas.llm import LLMQueryInterpretation


@pytest.mark.parametrize(
    ("raw_intent", "expected"),
    [
        ("aggregation", "summary"),
        ("count", "summary"),
        ("summary", "summary"),
        ("ranking", "ranking"),
        ("top", "ranking"),
        ("unknown_llm_label", "summary"),
    ],
)
def test_llm_query_interpretation_intent_normalizes(raw_intent: str, expected: str) -> None:
    m = LLMQueryInterpretation.model_validate({"intent": raw_intent, "confidence": 0.9})
    assert m.intent == expected


def test_llm_query_interpretation_query_scope_unknown_becomes_data() -> None:
    """Неизвестные значения query_scope приводятся к data (см. _normalize_query_scope)."""
    m = LLMQueryInterpretation.model_validate({"intent": "summary", "query_scope": "not_a_scope"})
    assert m.query_scope == "data"
