"""HTTP: `/api/v1/admin/sql-policy` (роль admin, валидация тела)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_current_active_user
from app.core.config import settings
from app.main import create_app
from app.repositories.platform_sql_policy_repository import PlatformSqlPolicyRepository
from app.schemas.admin_sql_policy import AdminSqlPolicyResponse


def _client_with_role(role_key: str) -> TestClient:
    app = create_app()
    user = MagicMock()
    user.email = "test@local"
    user.is_active = True
    role = MagicMock()
    role.role_key = role_key
    user.role = role
    app.dependency_overrides[get_current_active_user] = lambda: user
    return TestClient(app)


@pytest.fixture
def admin_client() -> TestClient:
    return _client_with_role("admin")


@pytest.fixture
def manager_client() -> TestClient:
    return _client_with_role("manager")


def test_sql_policy_get_forbidden_for_manager(manager_client: TestClient) -> None:
    r = manager_client.get("/api/v1/admin/sql-policy")
    assert r.status_code == 403


def test_sql_policy_get_ok_for_admin(admin_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    eff = settings.model_copy(
        update={
            "sql_whitelist_tables": ["train", "extra_one"],
            "sql_whitelist_columns": ["col_a"],
            "sql_default_limit": 400,
        }
    )
    monkeypatch.setattr(
        "app.api.routes.admin_sql_policy.get_effective_sql_settings",
        lambda: eff,
    )
    monkeypatch.setattr(
        "app.api.routes.admin_sql_policy._read_extras_from_db",
        lambda: (["extra_one"], ["col_a"], 400),
    )
    r = admin_client.get("/api/v1/admin/sql-policy")
    assert r.status_code == 200
    j = r.json()
    assert j["extra_whitelist_tables"] == ["extra_one"]
    assert j["extra_whitelist_columns"] == ["col_a"]
    assert j["nl_max_result_rows"] == 400
    assert "train" in j["effective_whitelist_tables"]
    assert j["effective_sql_default_limit"] == 400


def test_sql_policy_put_invalid_ident(admin_client: TestClient) -> None:
    r = admin_client.put(
        "/api/v1/admin/sql-policy",
        json={"extra_whitelist_tables": ["bad-name"], "extra_whitelist_columns": [], "nl_max_result_rows": None},
    )
    assert r.status_code == 422


def test_sql_policy_put_nl_cap_out_of_range(admin_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "sql_default_limit", 50)
    monkeypatch.setattr(settings, "sql_execution_hard_row_cap", 5000)
    r = admin_client.put(
        "/api/v1/admin/sql-policy",
        json={"extra_whitelist_tables": [], "extra_whitelist_columns": [], "nl_max_result_rows": 999},
    )
    assert r.status_code == 422
    msg = (r.json().get("message") or "").lower()
    assert "nl_max_result_rows" in msg or "лимит" in msg or "1.." in msg


def test_sql_policy_put_ok_mocked_db(
    admin_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "sql_default_limit", 200)
    monkeypatch.setattr(settings, "sql_execution_hard_row_cap", 5000)

    captured: dict[str, object] = {}

    def _fake_update_singleton(
        self: PlatformSqlPolicyRepository,
        *,
        extra_tables: list[str],
        extra_columns: list[str],
        nl_max_result_rows: int | None,
    ) -> None:
        captured["extra_tables"] = extra_tables
        captured["extra_columns"] = extra_columns
        captured["nl_max_result_rows"] = nl_max_result_rows

    monkeypatch.setattr(PlatformSqlPolicyRepository, "update_singleton", _fake_update_singleton)
    monkeypatch.setattr("app.api.routes.admin_sql_policy.invalidate_effective_sql_settings_cache", lambda: None)

    eff = settings.model_copy(
        update={
            "sql_whitelist_tables": ["train", "t2"],
            "sql_whitelist_columns": ["c1"],
            "sql_default_limit": 150,
        }
    )

    def _fake_build() -> AdminSqlPolicyResponse:
        return AdminSqlPolicyResponse(
            extra_whitelist_tables=list(captured.get("extra_tables", [])),  # type: ignore[arg-type]
            extra_whitelist_columns=list(captured.get("extra_columns", [])),  # type: ignore[arg-type]
            nl_max_result_rows=captured.get("nl_max_result_rows"),  # type: ignore[arg-type]
            effective_whitelist_tables=list(eff.sql_whitelist_tables),
            effective_whitelist_columns=list(eff.sql_whitelist_columns),
            effective_sql_default_limit=int(eff.sql_default_limit),
        )

    monkeypatch.setattr("app.api.routes.admin_sql_policy._build_response", _fake_build)

    r = admin_client.put(
        "/api/v1/admin/sql-policy",
        json={
            "extra_whitelist_tables": ["t2"],
            "extra_whitelist_columns": ["c1"],
            "nl_max_result_rows": 150,
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert j["extra_whitelist_tables"] == ["t2"]
    assert j["nl_max_result_rows"] == 150
    assert captured["nl_max_result_rows"] == 150
