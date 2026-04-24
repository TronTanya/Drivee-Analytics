from __future__ import annotations

import pytest

from app.core.config import Settings


def test_unknown_app_env_rejected() -> None:
    with pytest.raises(ValueError, match="APP_ENV должен быть одним из"):
        Settings(app_env="staging-ish")


def test_prod_rejects_demo_bypass_and_mock_flags() -> None:
    with pytest.raises(ValueError, match="DEMO_AUTH_BYPASS_ENABLED запрещён"):
        Settings(app_env="prod", jwt_secret="x", demo_auth_bypass_enabled=True)
    with pytest.raises(ValueError, match="MOCK_MODE запрещён"):
        Settings(app_env="production", jwt_secret="x", mock_mode=True)
    with pytest.raises(ValueError, match="MOCK_SQL_EXECUTION_FALLBACK запрещён"):
        Settings(app_env="production", jwt_secret="x", mock_sql_execution_fallback=True)


def test_ci_rejects_demo_bypass() -> None:
    with pytest.raises(ValueError, match="CI запрещён"):
        Settings(app_env="ci", demo_auth_bypass_enabled=True)
