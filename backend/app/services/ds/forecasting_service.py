from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.models.analytics_history import InsightLog
from app.models.data_pipeline import ForecastResult, ForecastRun
from app.models.metrics import AnomalyEvent, MetricSnapshot
from app.models.user import User
from app.repositories.data_pipeline_repository import DataPipelineRepository
from app.services.ds.load_frame import load_default_source_dataframe, load_upload_dataframe
from app.services.ds.metrics_forecast import (
    clean_series_for_modeling,
    compute_metrics_bundle,
    generate_insights,
    prepare_daily_metrics_for_forecast,
    run_forecast_bundle,
    _smape,
)
from app.services.ds.strategies import ForecastStrategy, default_strategies


@dataclass
class ForecastComputationResult:
    date_column: str
    semantic_column_map: dict[str, str]
    metrics: dict[str, Any]
    forecasts: dict[str, Any]
    insights: list[str]
    forecast_run_id: Optional[UUID]


def _safe_mape(actual: np.ndarray, pred: np.ndarray) -> float:
    denom = np.where(np.abs(actual) < 1e-8, np.nan, np.abs(actual))
    ape = np.abs(actual - pred) / denom
    if np.isnan(ape).all():
        return 0.0
    return float(np.nanmean(ape) * 100.0)


def _score_backtest(actual: np.ndarray, pred: np.ndarray) -> dict[str, float]:
    actual = np.nan_to_num(actual.astype(float), nan=0.0, posinf=0.0, neginf=0.0)
    pred = np.nan_to_num(pred.astype(float), nan=0.0, posinf=0.0, neginf=0.0)
    # Clip extremes to keep metrics numerically stable on large raw datasets.
    clip_min, clip_max = -1e9, 1e9
    actual = np.clip(actual, clip_min, clip_max)
    pred = np.clip(pred, clip_min, clip_max)
    err = np.clip(pred - actual, clip_min, clip_max)
    mae = float(np.mean(np.abs(err)))
    rmse = float(np.sqrt(np.mean(np.square(err))))
    mape = float(_safe_mape(actual, pred))
    smape = float(_smape(actual, pred))
    if not np.isfinite(mae):
        mae = 1e9
    if not np.isfinite(rmse):
        rmse = 1e9
    if not np.isfinite(mape):
        mape = 1e9
    if not np.isfinite(smape):
        smape = 1e9
    # Lower is better; weighted toward absolute fit and calibration.
    score = float(mae * 0.35 + rmse * 0.35 + mape * 0.15 + smape * 0.15)
    if not np.isfinite(score):
        score = 1e9
    return {
        "mae": round(mae, 4),
        "rmse": round(rmse, 4),
        "mape": round(mape, 4),
        "smape": round(smape, 4),
        "score": round(score, 4),
    }


def _walk_forward_backtest(values: np.ndarray, strategy: ForecastStrategy, holdout_days: int) -> tuple[np.ndarray, np.ndarray]:
    holdout_days = max(3, int(holdout_days))
    if len(values) <= holdout_days + 2:
        return np.array([], dtype=float), np.array([], dtype=float)
    train_start = len(values) - holdout_days
    preds: list[float] = []
    actuals: list[float] = []
    for step in range(holdout_days):
        end = train_start + step
        train = values[:end]
        if len(train) < 2:
            continue
        pred = strategy.predict(train, 1)
        preds.append(float(pred[0]) if pred else 0.0)
        actuals.append(float(values[end]))
    return np.asarray(actuals, dtype=float), np.asarray(preds, dtype=float)


class DataScienceForecastService:
    """MVP deterministic forecasting orchestration with explainable persistence."""

    def __init__(self, session: Session, *, strategies: Optional[list[ForecastStrategy]] = None) -> None:
        self.session = session
        self.repo = DataPipelineRepository(session)
        self.strategies = strategies or default_strategies()

    def run(
        self,
        *,
        workspace_id,
        upload_id,
        user: User,
        horizon_days: int,
        preferred_strategy: Optional[str] = None,
        date_column: Optional[str] = None,
        notebook_id=None,
        source_table: Optional[str] = None,
    ) -> ForecastComputationResult:
        if upload_id is not None:
            df, smap = load_upload_dataframe(self.session, upload_id=upload_id, workspace_id=workspace_id)
        else:
            df, smap = load_default_source_dataframe(source_table=source_table)
        metrics = compute_metrics_bundle(df, smap)

        prepared_series: dict[str, Any] = {}
        resolved_date_col = date_column or ""
        insights: list[str] = []
        forecasts_payload: dict[str, Any] = {}
        run_id: Optional[UUID] = None

        try:
            prepared_series, resolved_date_col = prepare_daily_metrics_for_forecast(df, smap, date_column)
        except ValueError:
            resolved_date_col = ""

        selected_strategies: dict[str, str] = {}
        data_quality: dict[str, Any] = {}
        backtest_summary: dict[str, Any] = {}
        for metric_key, prepared in prepared_series.items():
            ser = prepared.series
            data_quality[metric_key] = prepared.quality
            values, transform_meta = clean_series_for_modeling(ser, metric_key=metric_key)
            holdout = max(7, min(21, max(7, len(values) // 4)))
            candidates: list[dict[str, Any]] = []
            for strategy in self.strategies:
                actual, pred = _walk_forward_backtest(values, strategy, holdout)
                if len(actual) == 0:
                    continue
                scored = _score_backtest(actual, pred)
                candidates.append({"strategy": strategy.key, "points": int(len(actual)), **scored})
            candidates.sort(key=lambda x: float(x["score"]))
            selected = candidates[0]["strategy"] if candidates else "rolling_average"
            if prepared.quality.get("baseline_only"):
                selected = "rolling_average"
            selected_strategies[metric_key] = selected
            backtest_summary[metric_key] = {
                "best_strategy": selected,
                "candidates": candidates,
                "data_quality": prepared.quality,
                "feature_preview": prepared.feature_preview,
                "transform": transform_meta,
            }
            forecasts_payload[metric_key] = run_forecast_bundle(
                ser,
                horizon_days=horizon_days,
                selected_strategy=selected,
                baseline_only=bool(prepared.quality.get("baseline_only")),
            )

        combined_forecast = {
            "per_metric": forecasts_payload,
            "end_of_week_note": (
                "Суммы «до конца недели» — по календарным дням до воскресенья "
                "(UTC-логика дат в данных)."
            ),
            "strategies": [s.key for s in self.strategies],
            "selected_strategies": selected_strategies,
            "data_quality": data_quality,
            "backtest_summary": backtest_summary,
        }

        rev_fc: dict[str, Any] = dict(forecasts_payload.get("revenue") or {})
        if not rev_fc and forecasts_payload:
            rev_fc = dict(next(iter(forecasts_payload.values())))
        insights = generate_insights(metrics, rev_fc, df, smap)
        if not resolved_date_col:
            insights.insert(0, "Колонка даты не найдена автоматически — укажите date_column в запросе для рядов прогноза.")
        elif not forecasts_payload:
            insights.insert(0, "Нет дневных рядов для метрик (проверьте разметку колонок: дата, выручка, заказы, отмены).")

        run_id = self._persist_forecast_run(
            workspace_id=workspace_id,
            notebook_id=notebook_id,
            user_id=user.id,
            horizon_days=horizon_days,
            metrics=metrics,
            forecasts_payload=forecasts_payload,
            date_column=resolved_date_col,
            preferred_strategy=preferred_strategy,
        )
        self._persist_metric_snapshots(workspace_id=workspace_id, notebook_id=notebook_id, metrics=metrics)
        self._persist_anomaly_events(workspace_id=workspace_id, notebook_id=notebook_id, run_id=run_id, metrics=metrics)
        self._persist_insight_log(
            workspace_id=workspace_id,
            user_id=user.id,
            notebook_id=notebook_id,
            run_id=run_id,
            insights=insights,
            payload={"metrics": metrics, "date_column": resolved_date_col},
        )

        return ForecastComputationResult(
            date_column=resolved_date_col,
            semantic_column_map=smap,
            metrics=metrics,
            forecasts=combined_forecast,
            insights=insights,
            forecast_run_id=run_id,
        )

    def run_automl_backtest(
        self,
        *,
        workspace_id,
        upload_id,
        user: User,
        horizon_days: int,
        holdout_days: int,
        strategies: Optional[list[str]] = None,
        date_column: Optional[str] = None,
        source_table: Optional[str] = None,
    ) -> dict[str, Any]:
        if upload_id is not None:
            df, smap = load_upload_dataframe(self.session, upload_id=upload_id, workspace_id=workspace_id)
        else:
            df, smap = load_default_source_dataframe(source_table=source_table)

        metrics_bundle = compute_metrics_bundle(df, smap)
        try:
            prepared_series, resolved_date_col = prepare_daily_metrics_for_forecast(df, smap, date_column)
        except ValueError:
            prepared_series, resolved_date_col = {}, ""

        available = {s.key: s for s in self.strategies}
        strategy_keys = [k for k in (strategies or []) if k in available] or list(available.keys())
        chosen = [available[k] for k in strategy_keys]

        leaderboards: list[dict[str, Any]] = []
        for metric_key, prepared in prepared_series.items():
            ser = prepared.series
            values, transform_meta = clean_series_for_modeling(ser, metric_key=metric_key)
            if len(values) < max(6, holdout_days + 2):
                leaderboards.append(
                    {
                        "metric_key": metric_key,
                        "best_strategy": None,
                        "best_score": None,
                        "forecast_preview": [],
                        "models": [
                            {
                                "strategy_key": s.key,
                                "status": "insufficient_history",
                                "mae": None,
                                "rmse": None,
                                "mape": None,
                                "smape": None,
                                "score": None,
                                "backtest_points": 0,
                                "backtest_preview": [],
                            }
                            for s in chosen
                        ],
                        "quality": prepared.quality,
                        "feature_preview": prepared.feature_preview,
                        "transform": transform_meta,
                    }
                )
                continue

            model_scores: list[dict[str, Any]] = []
            for s in chosen:
                try:
                    actual, pred = _walk_forward_backtest(values, s, holdout_days)
                    if len(pred) != len(actual):
                        raise ValueError("prediction_length_mismatch")
                    score = _score_backtest(actual, pred)
                    backtest_preview = []
                    for i in range(len(actual)):
                        ts = pd.Timestamp(ser.index[-len(actual) + i])
                        backtest_preview.append(
                            {
                                "date": str(ts.date()),
                                "actual": round(float(actual[i]), 4),
                                "predicted": round(float(pred[i]), 4),
                            }
                        )
                    model_scores.append(
                        {
                            "strategy_key": s.key,
                            "status": "ok",
                            "backtest_points": int(len(actual)),
                            "backtest_preview": backtest_preview,
                            **score,
                        }
                    )
                except Exception:
                    model_scores.append(
                        {
                            "strategy_key": s.key,
                            "status": "failed",
                            "mae": None,
                            "rmse": None,
                            "mape": None,
                            "smape": None,
                            "score": None,
                            "backtest_points": 0,
                            "backtest_preview": [],
                        }
                    )

            ok_models = [m for m in model_scores if m["status"] == "ok" and m["score"] is not None]
            ok_models.sort(key=lambda m: float(m["score"]))
            best = ok_models[0] if ok_models else None

            forecast_preview: list[dict[str, Any]] = []
            if best is not None:
                best_strategy = available[best["strategy_key"]]
                future = best_strategy.predict(values, horizon_days)
                last_idx = ser.index.max()
                last_ts = pd.Timestamp(last_idx)
                for i, v in enumerate(future[:horizon_days]):
                    forecast_preview.append(
                        {
                            "step": i + 1,
                            "date": str((last_ts + pd.Timedelta(days=i + 1)).date()),
                            "value": round(float(v), 4),
                        }
                    )

            leaderboards.append(
                {
                    "metric_key": metric_key,
                    "best_strategy": best["strategy_key"] if best else None,
                    "best_score": best["score"] if best else None,
                    "forecast_preview": forecast_preview,
                    "models": model_scores,
                    "quality": prepared.quality,
                    "feature_preview": prepared.feature_preview,
                    "transform": transform_meta,
                }
            )

        return {
            "workspace_id": workspace_id,
            "upload_id": upload_id,
            "source_table": source_table,
            "date_column": resolved_date_col,
            "horizon_days": horizon_days,
            "holdout_days": holdout_days,
            "strategy_candidates": strategy_keys,
            "metrics_snapshot": metrics_bundle,
            "leaderboards": leaderboards,
        }

    def _persist_forecast_run(
        self,
        *,
        workspace_id,
        notebook_id,
        user_id,
        horizon_days: int,
        metrics: dict[str, Any],
        forecasts_payload: dict[str, Any],
        date_column: str,
        preferred_strategy: Optional[str] = None,
    ) -> Optional[UUID]:
        if not forecasts_payload:
            return None

        selected_strategies = {
            key: (payload.get("selected_strategy") if isinstance(payload, dict) else None)
            for key, payload in forecasts_payload.items()
        }
        run = ForecastRun(
            workspace_id=workspace_id,
            notebook_id=notebook_id,
            metric_key="orders_count" if "orders_count" in forecasts_payload else next(iter(forecasts_payload)),
            method=preferred_strategy or selected_strategies.get("orders_count") or "strategy_bundle_v1",
            parameters_json={"horizon_days": horizon_days, "date_column": date_column},
            horizon_steps=horizon_days,
            run_status="succeeded",
            forecast_metadata_json={
                "metrics": list(forecasts_payload.keys()),
                "summary_metrics": metrics,
                "selected_strategies": selected_strategies,
            },
            created_by=user_id,
            started_at=datetime.now(timezone.utc),
            finished_at=datetime.now(timezone.utc),
        )
        self.repo.add_forecast_run(run)

        metric_key = run.metric_key
        next7_block = (forecasts_payload.get(metric_key) or {}).get("next_7_days") or {}
        strategy_key = preferred_strategy if preferred_strategy in next7_block else (selected_strategies.get(metric_key) or "linear_regression")
        next7 = next7_block.get(strategy_key, [])
        for idx, point in enumerate(next7):
            ts = datetime.fromisoformat(point["date"]) if "T" in point["date"] else datetime.fromisoformat(point["date"] + "T00:00:00")
            ts = ts.replace(tzinfo=timezone.utc)
            self.repo.add_forecast_result(
                ForecastResult(
                    forecast_run_id=run.id,
                    step_index=idx + 1,
                    forecast_timestamp=ts,
                    predicted_value=Decimal(str(point["value"])),
                    lower_bound=Decimal(str(round(float(point["value"]) * 0.9, 4))),
                    upper_bound=Decimal(str(round(float(point["value"]) * 1.1, 4))),
                    confidence_score=Decimal("0.8"),
                    components_json={"strategy": strategy_key},
                )
            )
        self.session.flush()
        return run.id

    def _persist_metric_snapshots(self, *, workspace_id, notebook_id, metrics: dict[str, Any]) -> None:
        today = datetime.now(timezone.utc).date()
        for key, value in metrics.items():
            if not isinstance(value, (int, float)):
                continue
            snap = MetricSnapshot(
                workspace_id=workspace_id,
                notebook_id=notebook_id,
                report_id=None,
                metric_key=key,
                dimension_key=None,
                dimension_value=None,
                snapshot_date=today,
                metric_value=Decimal(str(round(float(value), 4))),
                payload_json={"source": "forecast_run"},
            )
            self.repo.add_metric_snapshot(snap)

    def _persist_anomaly_events(self, *, workspace_id, notebook_id, run_id: Optional[UUID], metrics: dict[str, Any]) -> None:
        cancellation_rate = float(metrics.get("cancellation_rate", 0) or 0)
        if cancellation_rate >= 0.15:
            event = AnomalyEvent(
                workspace_id=workspace_id,
                metric_snapshot_id=None,
                forecast_run_id=run_id,
                notebook_id=notebook_id,
                report_id=None,
                severity="medium" if cancellation_rate < 0.25 else "high",
                event_type="cancellation_rate_spike",
                title="Рост cancellation rate",
                description=f"Отношение отмен к заказам достигло {cancellation_rate:.2%}.",
                payload_json={"cancellation_rate": cancellation_rate},
                detected_at=datetime.now(timezone.utc),
            )
            self.repo.add_anomaly_event(event)

    def _persist_insight_log(
        self,
        *,
        workspace_id,
        user_id,
        notebook_id,
        run_id: Optional[UUID],
        insights: list[str],
        payload: dict[str, Any],
    ) -> None:
        if not insights:
            return
        insight = InsightLog(
            history_id=None,
            workspace_id=workspace_id,
            user_id=user_id,
            notebook_id=notebook_id,
            report_id=None,
            insight_title="Forecast summary",
            insight_text=insights[0],
            insight_payload_json={**payload, "forecast_run_id": str(run_id) if run_id else None, "insights": insights},
        )
        self.repo.add_insight_log(insight)