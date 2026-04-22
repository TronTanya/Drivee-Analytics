from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import numpy as np
import pandas as pd

from app.core.config import settings

@dataclass
class PreparedMetricSeries:
    metric_key: str
    series: pd.Series
    quality: dict[str, Any]
    feature_preview: list[dict[str, Any]]


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


def _smape(actual: np.ndarray, pred: np.ndarray) -> float:
    denom = np.abs(actual) + np.abs(pred)
    safe = np.where(denom < 1e-8, np.nan, denom)
    frac = 2.0 * np.abs(pred - actual) / safe
    if np.isnan(frac).all():
        return 0.0
    return float(np.nanmean(frac) * 100.0)


def assess_series_quality(series: pd.Series) -> dict[str, Any]:
    if series is None or len(series) == 0:
        return {
            "history_points": 0,
            "missing_ratio": 1.0,
            "volatility_cv": None,
            "baseline_only": True,
            "reasons": ["empty_series"],
        }
    y = pd.to_numeric(series, errors="coerce")
    missing_ratio = float(y.isna().mean())
    y = y.fillna(0.0)
    mean = float(y.mean())
    std = float(y.std(ddof=0))
    cv = float(std / abs(mean)) if abs(mean) > 1e-8 else None
    q1 = float(y.quantile(0.25))
    q3 = float(y.quantile(0.75))
    iqr = q3 - q1
    if iqr > 1e-8:
        lo = q1 - 1.5 * iqr
        hi = q3 + 1.5 * iqr
        anomaly_ratio = float(((y < lo) | (y > hi)).mean())
    else:
        anomaly_ratio = 0.0
    reasons: list[str] = []
    if len(y) < 14:
        reasons.append("short_history")
    if missing_ratio > 0.30:
        reasons.append("high_missing_ratio")
    if cv is not None and cv > 2.2:
        reasons.append("high_volatility")
    if anomaly_ratio > 0.15:
        reasons.append("high_anomaly_ratio")
    return {
        "history_points": int(len(y)),
        "missing_ratio": round(missing_ratio, 4),
        "volatility_cv": round(cv, 4) if cv is not None else None,
        "anomaly_ratio": round(anomaly_ratio, 4),
        "baseline_only": bool(reasons),
        "reasons": reasons,
    }


def clean_series_for_modeling(series: pd.Series, *, metric_key: str) -> tuple[np.ndarray, dict[str, Any]]:
    y = pd.to_numeric(series, errors="coerce").fillna(0.0).astype(float)
    y = y.replace([np.inf, -np.inf], 0.0)
    y = y.clip(lower=-1e12, upper=1e12)
    q_lo = float(y.quantile(0.01))
    q_hi = float(y.quantile(0.99))
    p95 = float(y.quantile(0.95))
    median = float(y.median())
    configured_cap = float(settings.ds_metric_caps.get(metric_key, 0.0) or 0.0)
    # Guardrails for pathological tails in raw operational dumps.
    if metric_key in {"orders_count", "done_rides", "cancellations_total"}:
        default_cap = min(1e7, max(1e3, abs(median) * 20.0, abs(p95) * 5.0))
        hard_cap = configured_cap if configured_cap > 0 else default_cap
        q_lo = 0.0
    else:
        default_cap = min(1e9, max(1e4, abs(median) * 50.0, abs(p95) * 10.0))
        hard_cap = configured_cap if configured_cap > 0 else default_cap
    q_hi = min(q_hi, hard_cap)
    if q_lo > q_hi:
        q_lo = 0.0
    clipped = y.clip(lower=q_lo, upper=q_hi)
    clipped_mask = (y < q_lo) | (y > q_hi)
    cap_hit_ratio = float(clipped_mask.mean()) if len(y) else 0.0
    use_log = metric_key in {"orders_count", "done_rides", "cancellations_total"} and float(clipped.max()) > 1e4
    transformed = np.log1p(clipped.to_numpy()) if use_log else clipped.to_numpy()
    transformed = np.nan_to_num(transformed, nan=0.0, posinf=0.0, neginf=0.0)
    meta = {
        "winsorized": True,
        "winsor_bounds": [round(q_lo, 4), round(q_hi, 4)],
        "log_transform": use_log,
        "configured_cap": configured_cap if configured_cap > 0 else None,
        "cap_hit_ratio": round(cap_hit_ratio, 4),
        "clipped_points": int(clipped_mask.sum()),
    }
    return transformed, meta


def build_feature_preview(series: pd.Series, *, limit: int = 10) -> list[dict[str, Any]]:
    if series is None or len(series) == 0:
        return []
    y = pd.to_numeric(series, errors="coerce").fillna(0.0)
    frame = pd.DataFrame({"value": y})
    frame["dow"] = frame.index.dayofweek
    frame["is_weekend"] = frame["dow"].isin([5, 6]).astype(int)
    frame["lag_1"] = frame["value"].shift(1)
    frame["lag_7"] = frame["value"].shift(7)
    frame["roll_mean_7"] = frame["value"].rolling(7, min_periods=1).mean()
    frame = frame.tail(limit)
    out: list[dict[str, Any]] = []
    for idx, row in frame.iterrows():
        ts = pd.Timestamp(idx)
        out.append(
            {
                "date": str(ts.date()),
                "value": round(float(row["value"]), 4),
                "dow": int(row["dow"]),
                "is_weekend": int(row["is_weekend"]),
                "lag_1": round(float(row["lag_1"]), 4) if pd.notna(row["lag_1"]) else None,
                "lag_7": round(float(row["lag_7"]), 4) if pd.notna(row["lag_7"]) else None,
                "roll_mean_7": round(float(row["roll_mean_7"]), 4),
            }
        )
    return out


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
    selected_strategy: str | None = None,
    baseline_only: bool = False,
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
    if baseline_only:
        # Explicitly reduce to robust baseline in low-quality data mode.
        methods = {"rolling_average": methods["rolling_average"]}
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
        "selected_strategy": selected_strategy,
        "baseline_only": baseline_only,
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

    # orders_count: prefer distinct order_id per day, fallback to row count per day.
    order_id_col = semantic_map.get("orders_count")
    if order_id_col and order_id_col in df.columns:
        d = df[[date_col, order_id_col]].copy()
        d[date_col] = pd.to_datetime(d[date_col], utc=True, errors="coerce").dt.normalize()
        d = d.dropna(subset=[date_col])
        try:
            series_map["orders_count"] = d.groupby(date_col, as_index=True)[order_id_col].nunique().sort_index().astype(float)
        except Exception:
            series_map["orders_count"] = d.groupby(date_col, as_index=True).size().sort_index().astype(float)

    # done_rides: count non-null completion events (driverdone_timestamp) per day.
    done_col = semantic_map.get("done_rides")
    if done_col and done_col in df.columns:
        d = df[[date_col, done_col]].copy()
        d[date_col] = pd.to_datetime(d[date_col], utc=True, errors="coerce").dt.normalize()
        d = d.dropna(subset=[date_col])
        series_map["done_rides"] = d.groupby(date_col, as_index=True)[done_col].apply(lambda s: float(s.notna().sum())).sort_index()

    # cancellations_total: count non-null cancellation events; prefer explicit client/driver columns.
    client_cancel_col = semantic_map.get("client_cancellations")
    driver_cancel_col = semantic_map.get("driver_cancellations")
    if (
        client_cancel_col
        and driver_cancel_col
        and client_cancel_col in df.columns
        and driver_cancel_col in df.columns
    ):
        d = df[[date_col, client_cancel_col, driver_cancel_col]].copy()
        d[date_col] = pd.to_datetime(d[date_col], utc=True, errors="coerce").dt.normalize()
        d = d.dropna(subset=[date_col])
        grouped = d.groupby(date_col, as_index=True)[[client_cancel_col, driver_cancel_col]]
        agg = grouped.count().sum(axis=1)
        series_map["cancellations_total"] = agg.astype(float).sort_index()
    else:
        cancel_col = semantic_map.get("cancellations_total")
        if cancel_col and cancel_col in df.columns:
            d = df[[date_col, cancel_col]].copy()
            d[date_col] = pd.to_datetime(d[date_col], utc=True, errors="coerce").dt.normalize()
            d = d.dropna(subset=[date_col])
            series_map["cancellations_total"] = d.groupby(date_col, as_index=True)[cancel_col].apply(
                lambda s: float(s.notna().sum())
            ).sort_index()

    # sum_order_price: true numeric sum per day.
    price_col = semantic_map.get("sum_order_price")
    if price_col and price_col in df.columns:
        series_map["sum_order_price"] = _daily_series(df, date_col, price_col)
    return series_map, date_col


def prepare_daily_metrics_for_forecast(
    df: pd.DataFrame,
    semantic_map: dict[str, str],
    date_col_override: Optional[str] = None,
) -> tuple[dict[str, PreparedMetricSeries], str]:
    series_map, date_col = build_daily_metrics_for_forecast(df, semantic_map, date_col_override)
    prepared: dict[str, PreparedMetricSeries] = {}
    for metric_key, series in series_map.items():
        quality = assess_series_quality(series)
        prepared[metric_key] = PreparedMetricSeries(
            metric_key=metric_key,
            series=series,
            quality=quality,
            feature_preview=build_feature_preview(series),
        )
    return prepared, date_col