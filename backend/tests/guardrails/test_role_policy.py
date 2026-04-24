from __future__ import annotations

import unittest

import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app.api.deps import require_capability
from app.core.exceptions import AppException
from app.auth.dependencies import get_current_active_user
from app.core.exceptions import ForbiddenException
from app.services.guardrails.role_policy import (
    SCHEDULE_REPORT,
    assert_role_capability,
    allowed_actions,
    summarize_role_policy_ru,
)


class RolePolicyMatrixTests(unittest.TestCase):
    def test_admin_has_dictionary(self) -> None:
        assert_role_capability("admin", "edit_dictionary")

    def test_marketer_denied_dictionary(self) -> None:
        with self.assertRaises(ForbiddenException):
            assert_role_capability("marketer", "edit_dictionary")

    def test_executive_denied_schedule(self) -> None:
        with self.assertRaises(ForbiddenException):
            assert_role_capability("executive", SCHEDULE_REPORT)

    def test_manager_can_schedule(self) -> None:
        assert_role_capability("manager", SCHEDULE_REPORT)

    def test_trace_summary_non_empty(self) -> None:
        s = summarize_role_policy_ru("executive")
        self.assertIn("executive", s)
        self.assertIn("разреш", s.lower())

    def test_unknown_role_falls_back_to_marketer_set(self) -> None:
        self.assertIn("run_query", allowed_actions("unknown_role_xyz"))


@pytest.fixture()
def capability_app():
    app = FastAPI()

    @app.exception_handler(AppException)
    async def _app_exc(_: Request, exc: AppException) -> JSONResponse:
        return JSONResponse({"detail": exc.message}, status_code=exc.status_code)

    class R:
        def __init__(self, key: str) -> None:
            self.role_key = key

    class U:
        def __init__(self, key: str) -> None:
            self.role = R(key)

    @app.get("/sched")
    def sched(user=Depends(require_capability("schedule_report"))):
        return {"ok": True, "role": user.role.role_key}

    return app


def test_fastapi_dependency_executive_blocked(capability_app: FastAPI):
    from unittest.mock import MagicMock

    user = MagicMock()
    user.role = MagicMock()
    user.role.role_key = "executive"
    capability_app.dependency_overrides[get_current_active_user] = lambda: user
    c = TestClient(capability_app)
    r = c.get("/sched")
    assert r.status_code == 403
