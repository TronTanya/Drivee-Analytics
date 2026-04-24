"""Публичный фасад baseline-прогноза для notebook / жюри.

Реализация: см. `baseline_forecast.run_baseline_forecast_sidecar` и `forecasting_service`
для полного DS-контура. Здесь только стабильный импорт и краткая документация MVP (7d).
"""

from __future__ import annotations

from app.services.ds.baseline_forecast import run_baseline_forecast_sidecar

__all__ = ["run_baseline_forecast_sidecar"]
