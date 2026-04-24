from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.core import config
from app.repositories.business_data_repository import BusinessDataRepository


def test_fetch_train_global_summary_stub_when_mock_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.settings, "mock_mode", True)
    session = MagicMock()
    repo = BusinessDataRepository(session)
    out = repo.fetch_train_global_summary()
    assert out["source_table"] == "public.train"
    assert out["train_row_count"] == 12_480
    assert out["sum_order_price"] is not None
    session.execute.assert_not_called()


def test_fetch_train_global_summary_queries_when_live(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config.settings, "mock_mode", False)
    session = MagicMock()
    row = {
        "train_row_count": 4,
        "distinct_orders": 4,
        "done_rides": 2,
        "cancellations_total": 2,
        "order_timestamp_min": None,
        "order_timestamp_max": None,
        "sum_order_price": 1140.0,
    }
    session.execute.return_value.mappings.return_value.first.return_value = row
    repo = BusinessDataRepository(session)
    out = repo.fetch_train_global_summary()
    assert out["train_row_count"] == 4
    assert out["distinct_orders"] == 4
    assert out["sum_order_price"] == 1140.0
    session.execute.assert_called_once()
