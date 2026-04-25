from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_demo_readiness_endpoint() -> None:
    app = create_app()
    client = TestClient(app)
    r = client.get("/api/v1/demo/readiness")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("ready", "degraded", "not_ready")
    assert "checks" in body
    for k in (
        "backend",
        "database",
        "semantic_dictionary",
        "guardrails",
        "reports",
        "schedules",
        "eval_results",
        "demo_user",
    ):
        assert k in body["checks"]
        assert body["checks"][k] in ("ok", "fail", "warn", "skipped")
    assert isinstance(body["score"], (int, float))
    assert 0.0 <= float(body["score"]) <= 1.0
