from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np

from app.services.ds.metrics_forecast import forecast_linear, forecast_rolling, forecast_trend


class ForecastStrategy(Protocol):
    key: str

    def predict(self, y: np.ndarray, horizon_days: int) -> list[float]:
        ...


@dataclass(frozen=True)
class RollingAverageStrategy:
    key: str = "rolling_average"

    def predict(self, y: np.ndarray, horizon_days: int) -> list[float]:
        return forecast_rolling(y, horizon_days)


@dataclass(frozen=True)
class TrendExtrapolationStrategy:
    key: str = "trend_extrapolation"

    def predict(self, y: np.ndarray, horizon_days: int) -> list[float]:
        return forecast_trend(y, horizon_days)


@dataclass(frozen=True)
class LinearRegressionStrategy:
    key: str = "linear_regression"

    def predict(self, y: np.ndarray, horizon_days: int) -> list[float]:
        return forecast_linear(y, horizon_days)


def default_strategies() -> list[ForecastStrategy]:
    return [RollingAverageStrategy(), TrendExtrapolationStrategy(), LinearRegressionStrategy()]
