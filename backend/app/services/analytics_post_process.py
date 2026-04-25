"""Лёгкий post-processing таблицы результата SQL: инсайт, простой прогноз, аномалии (без изменения оркестратора)."""

from __future__ import annotations

import logging
import math
import re
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

_FORECAST_INSUFFICIENT_NOTE_RU = "Недостаточно данных для прогноза"

_METRIC_HINTS = (
    "price",
    "revenue",
    "sum",
    "count",
    "avg",
    "total",
    "gmv",
    "orders",
    "amount",
    "value",
    "metric",
)

_TIME_HINTS = ("_at", "date", "day", "week", "month", "year", "bucket", "period", "ts", "time")


def _pick_numeric_column(df: pd.DataFrame) -> str | None:
    best: tuple[int, str] = (-1, "")
    for col in df.columns:
        cl = str(col).lower()
        # Не считаем суррогатные id метрикой — иначе «город» не попадёт в измерение.
        if cl == "id" or cl.endswith("_id"):
            continue
        s = pd.to_numeric(df[col], errors="coerce")
        nn = int(s.notna().sum())
        if nn < max(2, int(0.35 * len(df))):
            continue
        score = nn + sum(10 for h in _METRIC_HINTS if h in cl)
        if score > best[0]:
            best = (score, str(col))
    return best[1] or None


def _pick_dimension_column(df: pd.DataFrame, metric: str | None) -> str | None:
    best: tuple[int, str] = (-1, "")
    for col in df.columns:
        if metric and str(col) == metric:
            continue
        s = df[col]
        is_cat_like = (
            s.dtype == object
            or pd.api.types.is_string_dtype(s)
            or pd.api.types.is_integer_dtype(s)
            or isinstance(s.dtype, pd.CategoricalDtype)
        )
        if not is_cat_like:
            continue
        try:
            nu = int(s.astype(str).nunique(dropna=True))
        except TypeError:
            continue
        # Отсекаем почти уникальные ключи (≈строка на сегмент); оставляем типичные измерения вроде города.
        if nu < 2 or nu > min(28, len(df) - 1):
            continue
        score = min(nu, 12)
        if score > best[0]:
            best = (score, str(col))
    return best[1] or None


def _pick_time_column(df: pd.DataFrame) -> str | None:
    for col in df.columns:
        cl = str(col).lower()
        if any(h in cl for h in _TIME_HINTS):
            return str(col)
    return None


def _metric_label_ru(metric_col: str) -> str:
    cl = metric_col.lower()
    if "price" in cl or "revenue" in cl or "sum_order" in cl:
        return "Выручка"
    if "count" in cl or "orders" in cl or "order" in cl:
        return "Показатель объёма"
    return f"Метрика «{metric_col}»"


def post_process_sql_result(rows: list[dict[str, Any]], columns: list[str]) -> dict[str, Any]:
    """Возвращает insights (строки), forecast (dict), anomalies (объекты). Без исключений наружу."""
    empty_forecast = {
        "summary": "",
        "delta_pct": None,
        "sufficient_data": False,
        "note_ru": _FORECAST_INSUFFICIENT_NOTE_RU,
    }
    out: dict[str, Any] = {"insights": [], "forecast": dict(empty_forecast), "anomalies": []}
    if not rows or not columns:
        return out
    try:
        df = pd.DataFrame(rows)
        if df.empty:
            return out
        # Оставляем только объявленные колонки, если совпадают
        cols = [c for c in columns if c in df.columns]
        if cols:
            df = df[cols]

        metric = _pick_numeric_column(df)
        dim = _pick_dimension_column(df, metric)
        tcol = _pick_time_column(df)

        if tcol:
            try:
                df = df.sort_values(by=tcol, kind="mergesort")
            except Exception:  # noqa: BLE001
                pass

        # --- Insight: сравнение половин выборки по метрике ---
        if metric is not None and len(df) >= 4:
            s = pd.to_numeric(df[metric], errors="coerce")
            mid = max(1, len(s) // 2)
            a = float(s.iloc[:mid].mean())
            b = float(s.iloc[mid:].mean())
            if math.isfinite(a) and math.isfinite(b) and abs(a) > 1e-9:
                pct = (b - a) / abs(a) * 100.0
                label = _metric_label_ru(metric)
                if pct >= 0:
                    out["insights"].append(f"{label} выросла на {pct:.1f}% относительно прошлого периода (вторая половина ряда к первой).")
                else:
                    out["insights"].append(f"{label} снизилась на {abs(pct):.1f}% относительно прошлого периода (вторая половина ряда к первой).")

        # --- Forecast: линейный тренд по индексу ---
        if metric is not None and len(df) >= 5:
            y = pd.to_numeric(df[metric], errors="coerce").astype(float).values
            mask = np.isfinite(y)
            if int(mask.sum()) >= 5:
                yv = y[mask]
                x = np.arange(len(yv), dtype=float)
                coef = np.polyfit(x, yv, 1)
                nxt = float(coef[0] * float(len(yv)) + coef[1])
                last = float(yv[-1])
                if math.isfinite(nxt) and math.isfinite(last) and abs(last) > 1e-9:
                    delta_pct = (nxt - last) / abs(last) * 100.0
                    out["forecast"] = {
                        "summary": f"Прогноз на следующий шаг ряда: {delta_pct:+.1f}% при сохранении текущего тренда (линейная аппроксимация по последним точкам).",
                        "delta_pct": round(delta_pct, 4),
                        "sufficient_data": True,
                        "note_ru": "",
                    }

        # --- Anomalies: z-score по сумме метрики в разрезе измерения ---
        if metric is not None and dim is not None and len(df) >= 3:
            s = pd.to_numeric(df[metric], errors="coerce")
            g = df.assign(_m=s).groupby(dim, dropna=True)["_m"].sum()
            if len(g) >= 3:
                mu = float(g.mean())
                sd = float(g.std(ddof=0))
                if sd > 1e-9 and math.isfinite(mu):
                    z = (g - mu) / sd
                    # При малом числе сегментов дисперсия «размывает» z; чуть мягче порог.
                    z_thr = 2.0 if len(g) >= 8 else 1.65
                    for name, zv in z.items():
                        if not math.isfinite(float(zv)) or abs(float(zv)) < z_thr:
                            continue
                        seg = str(name)
                        direction = "падение" if float(zv) < 0 else "рост"
                        pct_vs_mean = (float(g[name]) - mu) / abs(mu) * 100.0 if abs(mu) > 1e-9 else 0.0
                        out["anomalies"].append(
                            {
                                "dimension": dim,
                                "segment": seg,
                                "z_score": round(float(zv), 3),
                                "message_ru": (
                                    f"В сегменте «{seg}» заметное {direction} метрики "
                                    f"({pct_vs_mean:+.1f}% к среднему по сегментам, z={float(zv):.2f}) — "
                                    f"стоит проверить канал привлечения или качество данных."
                                ),
                            }
                        )
    except Exception as exc:  # noqa: BLE001
        logger.info("analytics_post_process skipped: %s", exc)
        return {"insights": [], "forecast": dict(empty_forecast), "anomalies": []}

    return out
