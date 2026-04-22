from __future__ import annotations

from unittest.mock import patch

from app.services.analytics_pipeline import _latest_staging_source_table


def test_latest_staging_source_table_returns_none_on_db_error() -> None:
    with patch("app.services.analytics_pipeline.SessionLocal", side_effect=RuntimeError("db unavailable")):
        assert _latest_staging_source_table() is None
