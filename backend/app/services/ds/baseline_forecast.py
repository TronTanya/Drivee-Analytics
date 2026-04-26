"""
Baseline-прогноз для sidecar после SQL (MVP, честный уровень).

Не production-ML: при устойчивом линейном тренде — экстраполяция; при слабом R² или коротком ряду —
«плоский» baseline по последнему факту. Ряд строится по результату SQL (в штатном режиме — public.incity_orders).

Полосы low/high — эвристический коридор по масштабу остатков, не классический CI.
"""

from __future__ import annotations

import math
import re
from typing import Any, Optional

import numpy as np
import pandas as pd

_TIME_HINT = re.compile(
    r"(^|_)(day|date|week|month|bucket|time|ts|at)$|_date$|_at$|^date_|^datetime",
    re.IGNORECASE,
)


def _looks_timeish(name: str) -> bool:
    return bool(_TIME_HINT.search(name.lower())) or name.lower() in {"dim", "period"}


def _pick_value_column(df: pd.DataFrame) -> Optional[str]:
    if "value" in df.columns:
        return "value"
    for c in df.columns:
        if pd.api.types.is_numeric_dtype(df[c]):
            return str(c)
    for c in df.columns:
        coerced = pd.to_numeric(df[c], errors="coerce")
        if coerced.notna().sum() >= max(2, int(len(df) * 0.5)):
            df[c] = coerced
            return str(c)
    return None


def _pick_sort_column(df: pd.DataFrame, value_col: str) -> Optional[str]:
    for c in df.columns:
        if c == value_col:
            continue
        if _looks_timeish(str(c)):
            return str(c)
    return None


def _aggregate_by_calendar_grain(df: pd.DataFrame, sort_col: str, value_col: str, grain: str) -> pd.DataFrame:
    """Агрегация дневного ряда в недели/месяцы по календарю (для «по неделям» / «по месяцам»)."""
    g = (grain or "day").lower()
    if g not in ("week", "month"):
        return df
    if sort_col not in df.columns:
        return df
    ts = pd.to_datetime(df[sort_col], errors="coerce")
    if int(ts.notna().sum()) < max(2, int(len(df) * 0.35)):
        return df
    work = df.assign(_ts=ts).dropna(subset=["_ts"])
    use_mean = any(x in value_col.lower() for x in ("rate", "share", "avg", "mean", "pct", "%", "conversion"))
    if g == "week":
        work["_bucket"] = work["_ts"].dt.to_period("W-SUN").astype(str)
    else:
        work["_bucket"] = work["_ts"].dt.to_period("M").astype(str)
    agg_fn = "mean" if use_mean else "sum"
    out = work.groupby("_bucket", as_index=False).agg({value_col: agg_fn})
    return out.rename(columns={"_bucket": sort_col})


def run_baseline_forecast_sidecar(
    rows: list[dict[str, Any]],
    *,
    horizon_steps: int = 4,
    time_grain: str = "day",
    source_table_label: str = "",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """
    Возвращает:
    - records: точки прогноза (step, forecast_value, forecast_low, forecast_high)
    - meta: объяснение, история, combined_series для UI (без обещаний «полноценного ML»).
    """
    grain = (time_grain or "day").lower()
    src_lbl = (source_table_label or "").strip() or "результат SQL (источник по умолчанию — public.incity_orders)"

    empty_meta: dict[str, Any] = {
        "method": "none",
        "method_label_ru": "Прогноз не построен",
        "explanation_ru": "Недостаточно строк или не найдена числовая метрика для ряда.",
        "warning_ru": None,
        "confidence_score": 0.0,
        "horizon_steps": int(horizon_steps),
        "metric_column": None,
        "history": [],
        "r_squared": None,
        "history_points": 0,
        "time_grain": grain,
        "source_table_label": src_lbl,
        "combined_series": [],
        "backtest_note_ru": "Walk-forward backtest для baseline не выполняется — это демонстрационный модуль.",
    }
    if len(rows) < 2:
        return [], empty_meta

    df = pd.DataFrame(rows)
    value_col = _pick_value_column(df)
    if value_col is None:
        return [], {**empty_meta, "warning_ru": "Не удалось выбрать числовую колонку метрики."}

    sort_col = _pick_sort_column(df, value_col)
    if sort_col:
        df = _aggregate_by_calendar_grain(df, sort_col, value_col, grain)
        try:
            df = df.sort_values(by=sort_col, kind="mergesort")
        except TypeError:
            df = df.sort_values(by=sort_col, key=lambda s: s.astype(str), kind="mergesort")

    y = pd.to_numeric(df[value_col], errors="coerce").astype(float).to_numpy()
    mask = np.isfinite(y)
    if mask.sum() < 2:
        return [], {**empty_meta, "warning_ru": "После очистки осталось меньше двух числовых значений."}
    y = y[mask]
    n = len(y)
    x = np.arange(n, dtype=float)

    coef = np.polyfit(x, y, 1)
    slope, intercept = float(coef[0]), float(coef[1])
    y_hat = slope * x + intercept
    y_mean = float(np.mean(y))
    ss_tot = float(np.sum((y - y_mean) ** 2))
    ss_res = float(np.sum((y - y_hat) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 1e-12 else 0.0
    r_squared = max(0.0, min(1.0, r_squared))

    residuals = y - y_hat
    sigma = float(np.std(residuals)) if n > 1 else float(np.std(y)) * 0.15
    if not math.isfinite(sigma) or sigma < 1e-9:
        sigma = max(float(np.std(y)) * 0.1, 1e-6)

    horizon = max(1, min(90, int(horizon_steps)))
    use_flat = n < 4 or r_squared < 0.15

    records: list[dict[str, Any]] = []
    if use_flat:
        last_v = float(y[-1])
        for i in range(horizon):
            low = last_v - 1.64 * sigma
            high = last_v + 1.64 * sigma
            records.append(
                {
                    "step": i + 1,
                    "forecast_value": round(last_v, 4),
                    "forecast_low": round(low, 4),
                    "forecast_high": round(high, 4),
                }
            )
        method = "baseline_flat_last"
        method_label_ru = "Устойчивый baseline: последнее фактическое значение (без слабого тренда)"
    else:
        for i in range(horizon):
            step_idx = n + i
            pred = float(slope * step_idx + intercept)
            low = pred - 1.64 * sigma
            high = pred + 1.64 * sigma
            records.append(
                {
                    "step": i + 1,
                    "forecast_value": round(pred, 4),
                    "forecast_low": round(low, 4),
                    "forecast_high": round(high, 4),
                }
            )
        method = "baseline_linear_trend"
        method_label_ru = "Линейный тренд по ряду (baseline, демо)"

    confidence = float(min(0.92, max(0.28, 0.32 + 0.55 * r_squared)))
    if n < 5:
        confidence *= 0.85
    if use_flat:
        confidence *= 0.9

    warnings: list[str] = []
    if n < 5:
        warnings.append("Мало точек ряда — baseline-прогноз очень ориентировочный.")
    if r_squared < 0.12 and not use_flat:
        warnings.append("Низкий R²: линейный тренд слабо описывает историю; не используйте как целевой KPI без проверки.")
    if use_flat and n >= 4:
        warnings.append("Тренд признан нестабильным для MVP — показан «плоский» baseline по последнему факту.")

    history: list[dict[str, Any]] = []
    tail_df = df.iloc[-min(24, len(df)) :]
    for _, row in tail_df.iterrows():
        period = str(row[sort_col]) if sort_col and sort_col in row else str(len(history))
        try:
            val = float(row[value_col])
        except (TypeError, ValueError):
            continue
        if math.isfinite(val):
            history.append({"period": period, "value": round(val, 4)})

    grain_ru = {"day": "день", "week": "неделя", "month": "месяц"}.get(grain, grain)
    trend_note = (
        "Тренд по ряду слабый — вместо экстраполяции использовано последнее фактическое значение."
        if use_flat
        else "Экстраполяция линейного тренда по упорядоченному ряду после SQL."
    )
    explanation_ru = (
        f"Модуль baseline-прогноза (не production ML): {trend_note} "
        f"Гранулярность анализа ряда: {grain_ru}. Метрика «{value_col}», точек в ряду: {n}. "
        f"Источник данных ряда: {src_lbl}. R²≈{r_squared:.2f} используется только как внутренняя эвристика. "
        "Полосы low/high — упрощённый коридор по масштабу остатков обучения. "
        "Для бизнес-решений подключайте DS-валидацию и holdout вне этого MVP."
    )

    combined_series: list[dict[str, Any]] = []
    ix = 0
    for h in history:
        combined_series.append({"idx": ix, "value": float(h["value"]), "segment": "history", "label": str(h["period"])})
        ix += 1
    for rec in records:
        combined_series.append(
            {
                "idx": ix,
                "value": float(rec["forecast_value"]),
                "segment": "forecast",
                "label": f"+{rec['step']}",
            }
        )
        ix += 1

    meta: dict[str, Any] = {
        "method": method,
        "method_label_ru": method_label_ru,
        "explanation_ru": explanation_ru,
        "warning_ru": " ".join(warnings) if warnings else None,
        "confidence_score": confidence,
        "horizon_steps": horizon,
        "metric_column": value_col,
        "sort_column": sort_col,
        "history": history,
        "r_squared": round(r_squared, 4),
        "history_points": n,
        "residual_sigma": round(sigma, 6),
        "time_grain": grain,
        "source_table_label": src_lbl,
        "combined_series": combined_series,
        "backtest_note_ru": "Полноценный walk-forward backtest не запускается в этом MVP; сравнивайте прогноз с фактом на holdout вне платформы.",
    }
    return records, meta
