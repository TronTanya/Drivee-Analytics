from __future__ import annotations

import uuid
from types import SimpleNamespace

from app.api.routes import templates_api


class _FakeTemplateRepo:
    def __init__(self, _session: object) -> None:
        self._tpl = SimpleNamespace(
            id=uuid.uuid4(),
            template_name="Drivee quick template",
            template_key="drivee_test_tpl",
            target_role_id=None,
            sql_template="SELECT 1",
            nl_prompt_template="Покажи выручку по городам",
            default_chart_type="bar",
            default_params_json={},
        )

    def get_in_workspace(self, _template_id: uuid.UUID, _workspace_id: uuid.UUID) -> SimpleNamespace:
        return self._tpl


def _fake_user() -> SimpleNamespace:
    return SimpleNamespace(id=uuid.uuid4(), role=SimpleNamespace(id=uuid.uuid4(), role_key="manager"))


def test_quick_run_template_direct_sql_includes_trace_fields(monkeypatch) -> None:
    monkeypatch.setattr(templates_api, "_require_workspace", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(templates_api, "QueryTemplateRepository", _FakeTemplateRepo)

    class _ExecSvc:
        def execute(self, **_kwargs):
            return SimpleNamespace(
                ok=True,
                final_sql="SELECT 1",
                rows=[{"v": 1}],
                validation_warnings=[],
                error=None,
            )

    monkeypatch.setattr(templates_api, "SQLExecutionService", _ExecSvc)

    resp = templates_api.quick_run_template(
        template_id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        user=_fake_user(),
        session=SimpleNamespace(),
    )
    assert resp.execution_status == "succeeded"
    assert resp.interpreted_intent.startswith("template_sql:")
    assert resp.trace_summary
    assert isinstance(resp.explainability_trace, list)
    assert len(resp.explainability_trace) >= 1


def test_quick_run_template_nl_fallback_includes_human_trace_steps(monkeypatch) -> None:
    monkeypatch.setattr(templates_api, "_require_workspace", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(templates_api, "QueryTemplateRepository", _FakeTemplateRepo)

    class _ExecSvcFail:
        def execute(self, **_kwargs):
            return SimpleNamespace(
                ok=False,
                final_sql="SELECT 1",
                rows=[],
                validation_warnings=["blocked by validator"],
                error="exec failed",
            )

    monkeypatch.setattr(templates_api, "SQLExecutionService", _ExecSvcFail)

    def _fake_nl(*_args, **_kwargs):
        return SimpleNamespace(
            execution_status="succeeded",
            safe_sql="SELECT city_id, SUM(price_order_local) FROM incity_orders GROUP BY city_id",
            insight="ok",
            chart_type="bar",
            table_records=[{"city_id": "67", "revenue": 100.0}],
            confidence=0.91,
            warnings=[],
            parsed={"intent": "comparison"},
            trace_summary="pipeline ok",
            full_trace={
                "human_trace": {
                    "intent_explanation": "intent comparison",
                    "metric_explanation": "sum revenue",
                    "grouping_explanation": "group by city_id",
                    "period_explanation": "last 7 days",
                    "chart_explanation": "bar by city",
                    "sql_safety_explanation": "validated",
                }
            },
        )

    monkeypatch.setattr(templates_api, "analyze_natural_language", _fake_nl)

    resp = templates_api.quick_run_template(
        template_id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        user=_fake_user(),
        session=SimpleNamespace(),
    )
    assert resp.execution_status == "succeeded"
    assert resp.interpreted_intent == "comparison"
    assert resp.trace_summary == "pipeline ok"
    assert len(resp.explainability_trace) >= 4
