"""
Smoke: POST /api/v1/analytics/run — маршрут, контракт ответа, ячейки и trace.

Без реальной БД: dependency override для пользователя + подмена analyze_natural_language.
"""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_current_active_user
from app.main import create_app
from app.services import analytics_pipeline as ap
from app.services.analytics_pipeline import NaturalLanguageAnalysisResult
from app.services.llm.llm_service import LLMService
import app.services.orchestration.query_orchestrator as qo_mod
import app.services.guardrails.policy_engine as pe


@pytest.fixture
def client_analytics_mocked(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = create_app()
    role = SimpleNamespace(role_key="admin")
    user = SimpleNamespace(id=uuid.uuid4(), email="smoke-http@test.local", is_active=True, role=role)
    app.dependency_overrides[get_current_active_user] = lambda: user

    def fake_analyze(prompt: str, **_: object) -> NaturalLanguageAnalysisResult:
        return NaturalLanguageAnalysisResult(
            prompt=prompt,
            safe_sql="SELECT city_id, cancelled FROM public.train LIMIT 3",
            table_records=[{"city_id": 1, "cancelled": 2}],
            chart_hint="Bar",
            chart_type="bar",
            insight="Smoke insight.",
            forecast_records=[
                {"step": 1, "forecast_value": 10.0, "forecast_low": 8.0, "forecast_high": 12.0},
            ],
            trace_summary="smoke",
            confidence=0.9,
            warnings=[],
            used_tables=["public.train"],
            used_columns=["city_id", "cancelled"],
            parsed={"intent": "ranking", "metric": "cancelled"},
            full_trace={
                "intent": "ranking",
                "entities": {},
                "forecast_mode": {"active": True, "method": "baseline_linear_trend"},
                "forecast_selection": {"metric_key": "cancelled"},
                "forecast_explainability": {
                    "explanation_ru": "Тестовое объяснение baseline.",
                    "horizon_steps": 1,
                    "method_label_ru": "Baseline",
                },
            },
            execution_status="succeeded",
        )

    monkeypatch.setattr(ap, "analyze_natural_language", fake_analyze)
    ap.MOCK_NOTEBOOK_CELLS.clear()

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.mark.smoke
def test_analytics_run_http_returns_trace_and_forecast_cell(client_analytics_mocked: TestClient) -> None:
    r = client_analytics_mocked.post(
        "/api/v1/analytics/run",
        json={
            "notebook_id": "smoke-http-nb",
            "prompt": "топ городов по отменам",
            "forecast_sidecar": "on",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["notebook_id"] == "smoke-http-nb"
    assert body.get("resolved_source_table") == "public.train"
    assert body["question"] == "топ городов по отменам"
    assert isinstance(body.get("cells"), list)
    types = [c["type"] for c in body["cells"]]
    assert "forecast" in types
    trace = body["trace"]
    assert trace.get("schema_version") == 1
    assert "forecast_explainability" in trace
    assert isinstance(trace["forecast_explainability"], dict)

    fc = next(c for c in body["cells"] if c["type"] == "forecast")
    payload = json.loads(fc["content"])
    assert payload.get("schema_version") == 1
    assert payload.get("records")


@pytest.fixture
def client_analytics_guardrails_live(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    """HTTP smoke с реальным orchestrator и guardrails (без подмены analyze_natural_language)."""
    app = create_app()
    role = SimpleNamespace(role_key="executive")
    user = SimpleNamespace(id=uuid.uuid4(), email="exec-smoke@test.local", is_active=True, role=role)
    app.dependency_overrides[get_current_active_user] = lambda: user

    # Детерминизм: исключаем внешний LLM, оставляем rules-first intent/entities.
    disabled = LLMService(provider=None, temperature=0, max_tokens=1, timeout_seconds=1)
    monkeypatch.setattr(qo_mod, "get_llm_service", lambda: disabled)
    monkeypatch.setattr(qo_mod.settings, "guardrails_max_prompt_chars", 80)
    ap.MOCK_NOTEBOOK_CELLS.clear()

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.mark.smoke
def test_analytics_run_http_guardrails_block_exposes_trace_codes(client_analytics_guardrails_live: TestClient) -> None:
    r = client_analytics_guardrails_live.post(
        "/api/v1/analytics/run",
        json={
            "notebook_id": "smoke-http-guardrails",
            "prompt": "Покажи выручку по дням за последние 7 дней. " * 8,
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    trace = body.get("trace") or {}
    guardrails = trace.get("guardrails") or {}
    assert guardrails.get("blocked") is True
    codes = [str(c) for c in (guardrails.get("codes") or [])]
    assert "prompt_abuse" in codes
    messages = [str(m) for m in (guardrails.get("messages_ru") or [])]
    assert messages
    assert any("слишком длинный" in m.lower() for m in messages)


@pytest.mark.smoke
def test_analytics_run_http_rate_limit_block_and_window_reset(
    client_analytics_guardrails_live: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    pe._RATE_BUCKETS.clear()
    monkeypatch.setattr(qo_mod.settings, "guardrails_rate_limit_enabled", True)
    monkeypatch.setattr(qo_mod.settings, "guardrails_rate_limit_window_seconds", 10)
    monkeypatch.setattr(qo_mod.settings, "guardrails_max_requests_per_window", 2)

    clock = {"t": 100.0}

    def fake_monotonic() -> float:
        return float(clock["t"])

    monkeypatch.setattr(pe.time, "monotonic", fake_monotonic)

    payload = {"notebook_id": "smoke-http-rate-limit", "prompt": "топ городов по отменам"}
    ok1 = client_analytics_guardrails_live.post("/api/v1/analytics/run", json=payload)
    assert ok1.status_code == 200
    assert ((ok1.json().get("trace") or {}).get("guardrails") or {}).get("blocked") is False

    clock["t"] = 101.0
    ok2 = client_analytics_guardrails_live.post("/api/v1/analytics/run", json=payload)
    assert ok2.status_code == 200
    assert ((ok2.json().get("trace") or {}).get("guardrails") or {}).get("blocked") is False

    clock["t"] = 102.0
    blocked = client_analytics_guardrails_live.post("/api/v1/analytics/run", json=payload)
    assert blocked.status_code == 200
    g = ((blocked.json().get("trace") or {}).get("guardrails") or {})
    assert g.get("blocked") is True
    assert "rate_limit" in [str(c) for c in (g.get("codes") or [])]
    assert any("лимит" in str(m).lower() for m in (g.get("messages_ru") or []))

    # Сдвигаем время за предел окна — следующий запрос снова разрешён.
    clock["t"] = 111.5
    reset = client_analytics_guardrails_live.post("/api/v1/analytics/run", json=payload)
    assert reset.status_code == 200
    g2 = ((reset.json().get("trace") or {}).get("guardrails") or {})
    assert g2.get("blocked") is False
