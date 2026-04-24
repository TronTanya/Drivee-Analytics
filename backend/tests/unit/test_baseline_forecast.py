"""Unit tests for baseline sidecar forecast (MVP, not production ML)."""

from __future__ import annotations

import importlib.util
import math
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))


def _load_baseline_forecast():
    path = _ROOT / "app" / "services" / "ds" / "baseline_forecast.py"
    spec = importlib.util.spec_from_file_location("_baseline_forecast_testmod", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_baseline = _load_baseline_forecast()
run_baseline_forecast_sidecar = _baseline.run_baseline_forecast_sidecar


def test_perfect_linear_series_high_r_squared() -> None:
    rows = [{"week": i, "value": 3.0 * i + 2.0} for i in range(12)]
    rec, meta = run_baseline_forecast_sidecar(rows, horizon_steps=3)
    assert len(rec) == 3
    assert meta["method"] == "baseline_linear_trend"
    assert meta["r_squared"] is not None
    assert float(meta["r_squared"]) > 0.999
    assert meta["metric_column"] == "value"
    assert "explanation_ru" in meta and len(str(meta["explanation_ru"])) > 40


def test_empty_input_returns_none_method() -> None:
    rec, meta = run_baseline_forecast_sidecar([], horizon_steps=4)
    assert rec == []
    assert meta["method"] == "none"


def test_forecast_band_width_positive() -> None:
    rows = [{"d": i, "m": float(i**1.05)} for i in range(8)]
    rec, meta = run_baseline_forecast_sidecar(rows, horizon_steps=2)
    assert len(rec) == 2
    for row in rec:
        assert math.isfinite(row["forecast_value"])
        assert row["forecast_low"] <= row["forecast_value"] <= row["forecast_high"]
