"""Unit: семантика, двусмысленность, скоринг уверенности (SemanticParser + Clarification)."""

from __future__ import annotations

import pytest

from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.semantic_parser import SemanticParser
from app.services.orchestration.semantic_service import SemanticService
from app.services.semantic_layer.store import SemanticDictionaryStore, _default_dictionary_path


@pytest.fixture
def dictionary_store() -> SemanticDictionaryStore:
    return SemanticDictionaryStore.load(_default_dictionary_path())


def test_semantic_resolution_prefers_cancellation_bucket(dictionary_store: SemanticDictionaryStore) -> None:
    q = "Покажи топ-1 города по количеству отменённых заказов на этот месяц"
    res = dictionary_store.resolve_query(q)
    assert res
    assert res[0].term_key in ("cancellations_total", "client_cancellations", "driver_cancellations")
    assert res[0].surface_form != "default"


def test_semantic_resolve_with_hint_overrides_default(dictionary_store: SemanticDictionaryStore) -> None:
    sem = SemanticService(store=dictionary_store)
    r = sem.resolve_with_hint("покажи динамику", "done_rides")
    assert r[0].term_key == "done_rides"
    assert "COUNT" in r[0].sql_fragment.upper() or "count" in r[0].sql_fragment.lower()


def test_ambiguity_city_scope_ranking_without_city_filter() -> None:
    p = SemanticParser()
    interp, _ = p.build(
        effective_query="топ по городам по отменам за неделю",
        intent="ranking",
        intent_signals=["keyword:ranking:топ"],
        entities={"top_n": 5},
    )
    assert "city_scope_all_vs_one" in interp.ambiguities


def test_ambiguity_revenue_definition_unclear() -> None:
    p = SemanticParser()
    interp, _ = p.build(
        effective_query="Выручка по городам за неделю",
        intent="ranking",
        intent_signals=[],
        entities={"top_n": 3},
    )
    assert "revenue_definition_unclear" in interp.ambiguities


def test_confidence_band_high_when_concrete() -> None:
    p = SemanticParser()
    interp, _ = p.build(
        effective_query="топ 5 по отменам за последние 7 дней",
        intent="ranking",
        intent_signals=["keyword:ranking:топ"],
        entities={"top_n": 5, "metric_hint": "cancellations_total", "llm_confidence": 0.9},
    )
    assert interp.confidence_score >= 0.72
    assert interp.confidence_band == "high"


def test_confidence_band_drops_with_ambiguities() -> None:
    p = SemanticParser()
    interp, _ = p.build(
        effective_query="Выручка по городам за неделю",
        intent="ranking",
        intent_signals=[],
        entities={"top_n": 3},
    )
    assert interp.ambiguities
    assert interp.confidence_band in ("high", "medium", "low")
    assert interp.confidence_score < 0.9


def test_clarification_revenue_triggers_question(dictionary_store: SemanticDictionaryStore) -> None:
    p = SemanticParser()
    sem = SemanticService(store=dictionary_store)
    interp, _ = p.build(
        effective_query="Выручка по городам за неделю",
        intent="ranking",
        intent_signals=[],
        entities={"top_n": 3},
    )
    hint = interp.metrics[0] if interp.metrics else ""
    eng = ClarificationEngine(llm_service=None)
    clar = eng.evaluate(
        ClarificationContext(
            effective_query="Выручка по городам за неделю",
            intent="ranking",
            entities={"top_n": 3},
            resolutions=sem.resolve_with_hint("Выручка по городам за неделю", hint),
            nondefault_semantic_count=1,
            intent_signals=[],
            interpretation=interp,
        )
    )
    assert clar.clarification_required
    assert clar.clarification_reason == "revenue_definition_ambiguous"
