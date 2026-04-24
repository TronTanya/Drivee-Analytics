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
