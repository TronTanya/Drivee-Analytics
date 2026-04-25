"""HTTP-контракт evaluation NL→SQL."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_active_user
from app.core.config import settings
from app.main import create_app
from app.services.llm.factory import get_llm_service


@pytest.fixture
def eval_client() -> TestClient:
    app = create_app()
    user = MagicMock()
    user.email = "test@local"
    user.is_active = True
    role = MagicMock()
    role.role_key = "admin"
    user.role = role
    app.dependency_overrides[get_current_active_user] = lambda: user
    return TestClient(app)


@pytest.fixture(autouse=True)
def _no_llm_for_eval_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "deepseek_api_key", "")
    get_llm_service.cache_clear()
    yield
    get_llm_service.cache_clear()


def test_nl_sql_cases_returns_list(eval_client: TestClient) -> None:
    r = eval_client.get("/api/v1/evaluation/nl-sql/cases")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 30
    assert "prompt" in data[0] and "id" in data[0]


def test_nl_sql_summary_schema(eval_client: TestClient) -> None:
    r = eval_client.get("/api/v1/evaluation/nl-sql/summary?mode=mock")
    assert r.status_code == 200
    body = r.json()
    for key in (
        "total_cases",
        "passed_cases",
        "overall_accuracy",
        "intent_accuracy",
        "sql_validation_pass_rate",
        "guardrail_accuracy",
        "clarification_accuracy",
    ):
        assert key in body
    assert 0.0 <= body["overall_accuracy"] <= 1.0


def test_nl_sql_run_returns_case_results(eval_client: TestClient) -> None:
    r = eval_client.post("/api/v1/evaluation/nl-sql/run", json={"mode": "mock"})
    assert r.status_code == 200
    body = r.json()
    assert "summary" in body and "case_results" in body
    assert len(body["case_results"]) >= 30
    first = body["case_results"][0]
    assert "checks" in first and "actual" in first and "expected" in first


def test_sql_correctness_cases(eval_client: TestClient) -> None:
    r = eval_client.get("/api/v1/evaluation/sql-correctness/cases")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert len(data) >= 20
    assert "prompt" in data[0] and "id" in data[0]


def test_sql_correctness_summary_schema(eval_client: TestClient) -> None:
    r = eval_client.get("/api/v1/evaluation/sql-correctness/summary?mode=mock")
    assert r.status_code == 200
    body = r.json()
    for key in (
        "total_cases",
        "passed_cases",
        "overall_accuracy",
        "fragment_pass_rate",
        "table_pass_rate",
        "live_scalar_pass_rate",
        "live_scalar_coverage",
        "sql_validation_pass_rate",
    ):
        assert key in body


def test_sql_correctness_run(eval_client: TestClient) -> None:
    r = eval_client.post("/api/v1/evaluation/sql-correctness/run", json={"mode": "mock"})
    assert r.status_code == 200
    body = r.json()
    assert "summary" in body and "case_results" in body
    assert len(body["case_results"]) >= 20


def test_quality_center_summary(eval_client: TestClient) -> None:
    r = eval_client.get("/api/v1/quality/summary?mode=deterministic")
    assert r.status_code == 200
    body = r.json()
    assert "overall_quality_score" in body
    assert "nl_sql_understanding" in body
    assert 0.0 <= body["overall_quality_score"] <= 1.0


def test_nl_sql_golden_eval_summary(eval_client: TestClient) -> None:
    r = eval_client.get("/api/v1/quality/nl-sql-golden-summary")
    assert r.status_code == 200
    body = r.json()
    assert "total_cases" in body
    assert "passed_cases" in body
    assert "score" in body
    assert "metrics" in body
    m = body["metrics"]
    for k in ("nl_sql_accuracy", "sql_safety", "chart_accuracy", "clarification_accuracy", "trace_completeness"):
        assert k in m
        assert 0.0 <= float(m[k]) <= 1.0
    assert "cases" in body and isinstance(body["cases"], list)
    assert "source" in body
    if body["total_cases"] > 0 and body["cases"]:
        row0 = body["cases"][0]
        for k in ("question", "expected_status", "actual_status", "chart", "guardrails", "passed"):
            assert k in row0


def test_understanding_cases_api(eval_client: TestClient) -> None:
    r = eval_client.get("/api/v1/evaluation/understanding/cases")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 30


def test_prompt_stability_api(eval_client: TestClient) -> None:
    r = eval_client.post(
        "/api/v1/evaluation/prompt-stability",
        json={"prompt": "Покажи лучшие каналы", "runs": 3, "mode": "deterministic"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["runs"] == 3
    assert "stability_score" in body


def test_quality_last_run_details(eval_client: TestClient) -> None:
    r = eval_client.get("/api/v1/evaluation/quality/last-run-details?mode=deterministic")
    assert r.status_code == 200
    body = r.json()
    assert "understanding" in body and body["understanding"]
    assert len(body["understanding"]["case_results"]) >= 30


def test_quality_repair_brief_latest(eval_client: TestClient) -> None:
    r = eval_client.get("/api/v1/evaluation/quality/repair-brief/latest")
    assert r.status_code == 200
    body = r.json()
    assert "found" in body
