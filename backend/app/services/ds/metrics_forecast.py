from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import numpy as np
import pandas as pd

def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def days_until_sunday_inclusive(d: date) -> int:
    w = d.weekday()  # Mon=0 .. Sun=6
    if w == 6:
        return 1
    return 7 - w


def _safe_div(a: float, b: float) -> Optional[float]:
    if b == 0 or b is None:
        return None
    return float(a) / float(b)


def compute_metrics_bundle(df: pd.DataFrame, semantic_map: dict[str, str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    price_c = semantic_map.get("sum_order_price")
    ord_c = semantic_map.get("orders_count")
    done_c = semantic_map.get("done_rides")
    client_cancel_c = semantic_map.get("client_cancellations")
    driver_cancel_c = semantic_map.get("driver_cancellations")
    duration_c = semantic_map.get("avg_duration_seconds")
    distance_c = semantic_map.get("avg_distance_meters")

    if ord_c and ord_c in df.columns:
        out["orders_count"] = float(pd.to_numeric(df[ord_c], errors="coerce").fillna(0).sum())
    if done_c and done_c in df.columns:
        out["done_rides"] = float(pd.to_numeric(df[done_c], errors="coerce").fillna(0).sum())
    if client_cancel_c and client_cancel_c in df.columns:
        out["client_cancellations"] = float(pd.to_numeric(df[client_cancel_c], errors="coerce").fillna(0).sum())
    if driver_cancel_c and driver_cancel_c in df.columns:
        out["driver_cancellations"] = float(pd.to_numeric(df[driver_cancel_c], errors="coerce").fillna(0).sum())
    if price_c and price_c in df.columns:
        price_series = pd.to_numeric(df[price_c], errors="coerce").fillna(0)
        out["sum_order_price"] = float(price_series.sum())
        out["avg_order_price"] = float(price_series.mean())
    if duration_c and duration_c in df.columns:
        out["avg_duration_seconds"] = float(pd.to_numeric(df[duration_c], errors="coerce").fillna(0).mean())
    if distance_c and distance_c in df.columns:
        out["avg_distance_meters"] = float(pd.to_numeric(df[distance_c], errors="coerce").fillna(0).mean())

    if out.get("orders_count"):
        total_orders = out["orders_count"]
        cancels_total = float(out.get("client_cancellations", 0)) + float(out.get("driver_cancellations", 0))
        out["cancellations_total"] = cancels_total
        out["cancellation_rate"] = cancels_total / total_orders
        out["done_conversion"] = float(out.get("done_rides", 0)) / total_orders
    return out


def _daily_series(df: pd.DataFrame, date_col: str, value_col: str) -> pd.Series:
    d = df[[date_col, value_col]].copy()
    d[date_col] = pd.to_datetime(d[date_col], utc=True, errors="coerce").dt.normalize()
    d[value_col] = pd.to_numeric(d[value_col], errors="coerce").fillna(0)
    d = d.dropna(subset=[date_col])
    g = d.groupby(date_col, as_index=True)[value_col].sum().sort_index()
    return g


def forecast_rolling(y: np.ndarray, horizon: int, window: int = 7) -> list[float]:
    if len(y) == 0:
        return [0.0] * horizon
    base = float(np.mean(y[-window:])) if len(y) else 0.0
    return [max(0.0, base)] * horizon


def forecast_trend(y: np.ndarray, horizon: int) -> list[float]:
    if len(y) < 2:
        return forecast_rolling(y, horizon)
    delta = float(y[-1] - y[0]) / max(1, len(y) - 1)
    out = []
    last = float(y[-1])
    for _ in range(horizon):
        last = max(0.0, last + delta)
        out.append(last)
    return out


def forecast_linear(y: np.ndarray, horizon: int) -> list[float]:
    if len(y) < 2:
        return forecast_rolling(y, horizon)
    x = np.arange(len(y), dtype=float)
    coef = np.polyfit(x, y.astype(float), 1)
    out = []
    for i in range(horizon):
        v = float(np.polyval(coef, len(y) + i))
        out.append(max(0.0, v))
    return out


def run_forecast_bundle(
    daily: pd.Series,
    *,
    horizon_days: int = 7,
) -> dict[str, Any]:
    if daily is None or len(daily) == 0:
        return {
            "history_points": 0,
            "last_history_date": None,
            "end_of_week_days_considered": days_until_sunday_inclusive(_today_utc()),
            "expected_until_end_of_week": {},
            "next_7_days": {},
        }
    y = np.nan_to_num(daily.values.astype(float), nan=0.0)
    idx = daily.index
    last_date = idx.max() if len(idx) else _today_utc()
    if isinstance(last_date, pd.Timestamp):
        last_d = last_date.date()
    else:
        last_d = last_date

    methods = {
        "rolling_average": forecast_rolling(y, horizon_days),
        "trend_extrapolation": forecast_trend(y, horizon_days),
        "linear_regression": forecast_linear(y, horizon_days),
    }
    d_until_sun = days_until_sunday_inclusive(_today_utc())
    eow: dict[str, float] = {}
    for name, series in methods.items():
        eow[name] = float(sum(series[: min(len(series), d_until_sun)]))

    future_dates = [last_d + timedelta(days=i + 1) for i in range(horizon_days)]
    next7 = {
        k: [{"date": str(future_dates[i]), "value": round(v[i], 2)} for i in range(min(horizon_days, len(v)))]
        for k, v in methods.items()
    }
    return {
        "history_points": len(y),
        "last_history_date": str(last_d),
        "end_of_week_days_considered": d_until_sun,
        "expected_until_end_of_week": {k: round(v, 2) for k, v in eow.items()},
        "next_7_days": next7,
    }


def generate_insights(
    metrics: dict[str, Any],
    forecast_block: dict[str, Any],
    df: pd.DataFrame,
    semantic_map: dict[str, str],
) -> list[str]:
    lines: list[str] = []
    lr_eow = forecast_block.get("expected_until_end_of_week", {}).get("linear_regression")
    if lr_eow is not None and "orders_count" in metrics:
        lines.append(
            f"Если текущий темп сохранится (линейный тренд), ожидаемое количество заказов до конца недели — около {lr_eow:,.0f}."
        )
    ra = forecast_block.get("expected_until_end_of_week", {}).get("rolling_average")
    if ra is not None and "done_rides" in metrics:
        lines.append(
            f"При сглаживании скользящим средним завершенные поездки до конца недели ожидаются на уровне ~{ra:,.0f}."
        )
    can_eow = forecast_block.get("expected_until_end_of_week", {}).get("trend_extrapolation")
    if can_eow is not None and metrics.get("cancellations_total") is not None:
        lines.append(
            f"Экстраполяция тренда отмен на ближайшие дни суммарно даёт ~{can_eow:,.0f} для метрики отмен."
        )

    city_c = semantic_map.get("city_id")
    price_c = semantic_map.get("sum_order_price")
    if city_c and price_c and city_c in df.columns and price_c in df.columns:
        avg_by_city = df.groupby(city_c)[price_c].apply(lambda s: pd.to_numeric(s, errors="coerce").mean()).dropna()
        if len(avg_by_city) > 1:
            best_city = avg_by_city.idxmax()
            worst_city = avg_by_city.idxmin()
            lines.append(
                f"Средняя стоимость заказа выше всего в city_id={best_city}, ниже всего в city_id={worst_city}."
            )

    if not lines:
        lines.append(
            "Недостаточно размеченных колонок для глубоких инсайтов; уточните поля даты/статусов/стоимости."
        )
    return lines


def build_daily_metrics_for_forecast(
    df: pd.DataFrame,
    semantic_map: dict[str, str],
    date_col_override: Optional[str] = None,
) -> tuple[dict[str, pd.Series], str]:
    """Returns per-metric daily series and resolved date column name."""
    date_col = date_col_override or semantic_map.get("date")
    if not date_col or date_col not in df.columns:
        candidates = [c for c in df.columns if "date" in c.lower() or c.lower() in ("dt", "day")]
        date_col = candidates[0] if candidates else ""
    if not date_col:
        raise ValueError("No date column found")
    series_map: dict[str, pd.Series] = {}
    for key in ("orders_count", "done_rides", "cancellations_total", "sum_order_price"):
        col = semantic_map.get(key)
        if col and col in df.columns:
            series_map[key] = _daily_series(df, date_col, col)
    return series_map, date_col
