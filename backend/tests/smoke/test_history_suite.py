"""
History suite:
- HTTP smoke for GET /api/v1/history contract
- Regression guard for ORM loader path compile (fix for 500 on history)
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.dialects import postgresql

import app.api.routes.history as history_route
from app.api.deps import get_current_active_user, get_db_session
from app.main import create_app
from app.services.query_history_service import list_query_history


class _ScalarResult:
    def all(self) -> list[object]:
        return []


class _ExecuteResult:
    def scalars(self) -> _ScalarResult:
        return _ScalarResult()


class _CaptureSession:
    def __init__(self) -> None:
        self.captured_stmt = None

    def execute(self, stmt):  # noqa: ANN001
        # Force ORM compile path (the previous history bug failed here).
        stmt.compile(dialect=postgresql.dialect())
        self.captured_stmt = stmt
        return _ExecuteResult()


@pytest.fixture
def client_history_mocked(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    app = create_app()
    role = SimpleNamespace(role_key="manager")
    user = SimpleNamespace(id=uuid.uuid4(), email="history-smoke@test.local", is_active=True, role=role)
    app.dependency_overrides[get_current_active_user] = lambda: user
    app.dependency_overrides[get_db_session] = lambda: object()

    def fake_require_workspace(*_: object, **__: object) -> None:
        return None

    def fake_list_query_history(*_: object, **kwargs: object) -> list[dict]:
        notebook_id = str(uuid.uuid4())
        cell_id = str(uuid.uuid4())
        ws_id = str(kwargs.get("workspace_id"))
        return [
            {
                "id": str(uuid.uuid4()),
                "notebook_id": notebook_id,
                "owner_user_id": str(user.id),
                "original_query": "Покажи отмены по городам",
                "interpreted_intent": {"intent": "ranking"},
                "interpreted_summary": "ranking · cancellations",
                "generated_sql_preview": "SELECT city_id, COUNT(*) FROM public.train GROUP BY city_id",
                "chart_type": "bar",
                "table_row_count": 3,
                "validation_status": "passed",
                "execution_status": "succeeded",
                "confidence": 0.91,
                "result_summary": "Топ-3 города по отменам",
                "author_role_key": "manager",
                "created_at": "2026-04-24T09:45:00Z",
                "rerun_notebook_id": notebook_id,
                "rerun_cell_id": cell_id,
                "save_as_report_body_hint": {
                    "workspace_id": ws_id,
                    "title": "Покажи отмены по городам",
                    "source_cell_id": cell_id,
                    "notebook_id": notebook_id,
                },
            }
        ]

    monkeypatch.setattr(history_route, "_require_workspace", fake_require_workspace)
    monkeypatch.setattr(history_route, "list_query_history", fake_list_query_history)

    with TestClient(app) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.mark.smoke
def test_history_http_returns_contract_shape(client_history_mocked: TestClient) -> None:
    ws = uuid.uuid4()
    r = client_history_mocked.get(f"/api/v1/history?workspace_id={ws}&scope=workspace")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, list)
    assert len(body) == 1
    row = body[0]
    assert row["original_query"]
    assert row["generated_sql_preview"]
    assert row["validation_status"] in ("passed", "failed", "warning", "pending")
    assert row["execution_status"] in ("succeeded", "failed", "running", "not_started")
    assert isinstance(row["save_as_report_body_hint"], dict)
    assert row["save_as_report_body_hint"]["workspace_id"] == str(ws)


def test_history_query_uses_notebookcell_loader_path() -> None:
    """
    Regression guard for /history 500:
    loader option must be anchored from NotebookCell root entity.
    """
    session = _CaptureSession()
    ws_id = uuid.uuid4()
    user_id = uuid.uuid4()

    rows = list_query_history(session, workspace_id=ws_id, user_id=user_id, scope="workspace")
    assert rows == []
    assert session.captured_stmt is not None
    assert session.captured_stmt._with_options  # noqa: SLF001

    opt_path = str(session.captured_stmt._with_options[0].path)  # noqa: SLF001
    assert "NotebookCell.notebook" in opt_path
    assert "Notebook.owner" in opt_path
