from __future__ import annotations

from unittest.mock import patch

from app.services import analytics_pipeline as ap
from app.services.analytics_pipeline import _latest_staging_source_table


def test_latest_staging_source_table_returns_none_on_db_error() -> None:
    with patch("app.services.analytics_pipeline.SessionLocal", side_effect=RuntimeError("db unavailable")):
        assert _latest_staging_source_table() is None


def test_enrich_notebook_context_defaults_to_train_when_no_explicit_source(monkeypatch) -> None:
    monkeypatch.setattr(ap.settings, "ds_implicit_source_use_latest_staging", False)
    monkeypatch.setattr(ap.settings, "ds_default_source_table", "public.incity_orders")
    ctx = ap.enrich_notebook_context_for_orchestration({})
    assert ctx["source_table"] == "public.incity_orders"
    assert ctx["ds_staging_qualified"] == "public.incity_orders"


def test_enrich_notebook_context_uses_latest_staging_only_when_flag_enabled(monkeypatch) -> None:
    monkeypatch.setattr(ap.settings, "ds_implicit_source_use_latest_staging", True)
    monkeypatch.setattr(ap.settings, "ds_default_source_table", "public.incity_orders")
    monkeypatch.setattr(ap, "_latest_staging_source_table", lambda: "user_staging.t_deadbeefcafe")
    ctx = ap.enrich_notebook_context_for_orchestration({})
    assert ctx["source_table"] == "user_staging.t_deadbeefcafe"


def test_enrich_notebook_context_explicit_source_wins_over_staging_flag(monkeypatch) -> None:
    monkeypatch.setattr(ap.settings, "ds_implicit_source_use_latest_staging", True)
    monkeypatch.setattr(ap, "_latest_staging_source_table", lambda: "user_staging.t_other")
    ctx = ap.enrich_notebook_context_for_orchestration({"source_table": "public.incity_orders"})
    assert ctx["source_table"] == "public.incity_orders"
