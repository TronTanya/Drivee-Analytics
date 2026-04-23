"""
Smoke: маршруты смонтированы, публичные отвечают, защищённые требуют JWT.

Не заменяют E2E с реальной БД — проверяют контракт поверхности API.
"""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


@pytest.mark.smoke
def test_health_returns_payload(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") in ("ok", "degraded")
    assert "database" in body


@pytest.mark.smoke
def test_dictionary_entries_public(client: TestClient) -> None:
    r = client.get("/api/v1/dictionary/entries")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


@pytest.mark.smoke
def test_notebooks_requires_auth(client: TestClient) -> None:
    r = client.get("/api/v1/notebooks")
    assert r.status_code == 401


@pytest.mark.smoke
def test_reports_requires_auth(client: TestClient) -> None:
    ws = uuid.uuid4()
    r = client.get(f"/api/v1/reports?workspace_id={ws}")
    assert r.status_code == 401


@pytest.mark.smoke
def test_templates_requires_auth(client: TestClient) -> None:
    ws = uuid.uuid4()
    r = client.get(f"/api/v1/templates?workspace_id={ws}")
    assert r.status_code == 401


@pytest.mark.smoke
def test_history_requires_auth(client: TestClient) -> None:
    ws = uuid.uuid4()
    r = client.get(f"/api/v1/history?workspace_id={ws}")
    assert r.status_code == 401
