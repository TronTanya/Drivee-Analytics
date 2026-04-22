from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_db_session
from app.core.exceptions import ForbiddenException, NotFoundException, ValidationException
from app.models.user import User
from app.repositories.data_pipeline_repository import DataPipelineRepository
from app.repositories.notebook_repository import NotebookRepository
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.data_science import (
    AutoMLBacktestRequest,
    AutoMLBacktestResponse,
    DefaultSourceProfileResponse,
    ForecastRunDetailResponse,
    ForecastRunListItem,
    ForecastRunListResponse,
    RefreshAnalyticsViewResponse,
    ForecastRunRequest,
    ForecastRunResponse,
    ImportPreviewResponse,
    ImportRunResponse,
    NotebookLinkUploadRequest,
    NotebookLinkUploadResponse,
    UploadCreateResponse,
    UploadDetailResponse,
    UploadListItem,
    ForecastResultPoint,
)
from app.services.ds.csv_workflow import import_upload_to_postgres, persist_upload_and_job, process_csv_bytes
from app.services.ds.load_frame import (
    ensure_and_refresh_orders_analytics_mv,
    load_upload_dataframe,
    profile_default_source_table,
)
from app.services.ds.metrics_forecast import (
    compute_metrics_bundle,
)
from app.services.ds.forecasting_service import DataScienceForecastService
from app.core.config import settings
from app.services.report_service import _require_workspace

data_router = APIRouter(prefix="/data", tags=["data"])
forecast_router = APIRouter(prefix="/forecast", tags=["forecast"])


def _notebook_access(session: Session, user: User, notebook_id: uuid.UUID) -> bool:
    nb_repo = NotebookRepository(session)
    nb = nb_repo.get_by_id(notebook_id)
    if not nb:
        return False
    if nb.owner_user_id == user.id:
        return True
    return WorkspaceRepository(session).user_has_workspace_access(user.id, nb.workspace_id)


@data_router.post("/upload", response_model=UploadCreateResponse)
async def upload_csv(
    workspace_id: uuid.UUID = Form(...),
    file: UploadFile = File(...),
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> UploadCreateResponse:
    _require_workspace(session, user.id, workspace_id)
    raw = await file.read()
    filename = file.filename or "upload.csv"
    up, job = persist_upload_and_job(
        session,
        workspace_id=workspace_id,
        user_id=user.id,
        filename=filename,
        raw=raw,
    )
    session.commit()
    session.refresh(up)
    session.refresh(job)
    df_preview, schema_doc = process_csv_bytes(raw, filename, max_rows=50_000)
    metrics = compute_metrics_bundle(df_preview, schema_doc.get("semantic_column_map", {}))
    return UploadCreateResponse(
        upload_id=up.id,
        import_job_id=job.id,
        file_name=up.file_name,
        file_size_bytes=int(up.file_size_bytes or 0),
        checksum_sha256=up.checksum_sha256,
        inferred_schema=schema_doc,
        metrics_preview=metrics,
    )


@data_router.get("/uploads", response_model=list[UploadListItem])
def list_uploads(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> list[UploadListItem]:
    _require_workspace(session, user.id, workspace_id)
    rows = DataPipelineRepository(session).list_uploads(workspace_id)
    return [
        UploadListItem(
            id=r.id,
            workspace_id=r.workspace_id,
            file_name=r.file_name,
            file_size_bytes=r.file_size_bytes,
            upload_status=r.upload_status,
            created_at=r.created_at,
        )
        for r in rows
    ]


@data_router.get("/default-source/profile", response_model=DefaultSourceProfileResponse)
def get_default_source_profile(
    source_table: Optional[str] = None,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> DefaultSourceProfileResponse:
    # Reuse workspace access guard for a platform-level default source.
    default_ws_id = WorkspaceRepository(session).get_default_workspace_id_for_user(user.id)
    if default_ws_id:
        _require_workspace(session, user.id, default_ws_id)
    profile = profile_default_source_table(source_table=source_table or settings.ds_default_source_table)
    return DefaultSourceProfileResponse(**profile)


@data_router.post("/default-source/refresh-analytics-view", response_model=RefreshAnalyticsViewResponse)
def refresh_default_analytics_view(
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> RefreshAnalyticsViewResponse:
    default_ws_id = WorkspaceRepository(session).get_default_workspace_id_for_user(user.id)
    if default_ws_id:
        _require_workspace(session, user.id, default_ws_id)
    result = ensure_and_refresh_orders_analytics_mv()
    return RefreshAnalyticsViewResponse(**result)


@data_router.get("/uploads/{upload_id}", response_model=UploadDetailResponse)
def get_upload(
    upload_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> UploadDetailResponse:
    repo = DataPipelineRepository(session)
    up = repo.get_upload(upload_id)
    if not up:
        raise NotFoundException("Upload not found")
    _require_workspace(session, user.id, up.workspace_id)
    job = repo.get_latest_job_for_upload(upload_id)
    schema = dict((job.source_schema_json if job else {}) or {})
    metrics: dict = {}
    raw = b""
    if up.storage_path:
        try:
            with open(up.storage_path, "rb") as fh:
                raw = fh.read()
        except OSError:
            raw = b""
    if raw:
        df_m, sd = process_csv_bytes(raw, up.file_name, max_rows=100_000)
        schema = sd
        metrics = compute_metrics_bundle(df_m, sd.get("semantic_column_map", {}))
    return UploadDetailResponse(
        upload=UploadListItem(
            id=up.id,
            workspace_id=up.workspace_id,
            file_name=up.file_name,
            file_size_bytes=up.file_size_bytes,
            upload_status=up.upload_status,
            created_at=up.created_at,
        ),
        import_job_id=job.id if job else None,
        job_status=job.job_status if job else None,
        inferred_schema=schema,
        metrics=metrics,
        transform=dict((job.transform_config_json if job else {}) or {}),
    )


@data_router.get("/import/{upload_id}/preview", response_model=ImportPreviewResponse)
def import_preview(
    upload_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> ImportPreviewResponse:
    repo = DataPipelineRepository(session)
    up = repo.get_upload(upload_id)
    if not up:
        raise NotFoundException("Upload not found")
    _require_workspace(session, user.id, up.workspace_id)
    job = repo.get_latest_job_for_upload(upload_id)
    if not job:
        raise NotFoundException("Import job not found")
    schema = job.source_schema_json or {}
    return ImportPreviewResponse(
        upload_id=upload_id,
        sample_rows=list(schema.get("sample_rows") or []),
        warnings=list(schema.get("warnings") or []),
        columns=list(schema.get("columns") or []),
        delimiter=str(schema.get("delimiter") or ","),
    )


@data_router.post("/import/{upload_id}/run", response_model=ImportRunResponse)
def run_import(
    upload_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> ImportRunResponse:
    repo = DataPipelineRepository(session)
    up = repo.get_upload(upload_id)
    if not up:
        raise NotFoundException("Upload not found")
    _require_workspace(session, user.id, up.workspace_id)
    job = repo.get_latest_job_for_upload(upload_id)
    if not job:
        raise NotFoundException("Import job not found")
    from app.utils.time import utc_now

    job.job_status = "running"
    job.started_at = utc_now()
    session.add(job)
    session.flush()
    try:
        result = import_upload_to_postgres(session, up, job)
    except Exception as exc:
        job.job_status = "failed"
        job.error_report_json = {"error": str(exc)}
        job.finished_at = utc_now()
        session.add(job)
        session.commit()
        raise ValidationException(f"Import failed: {exc}") from exc
    session.commit()
    session.refresh(job)
    df, smap = load_upload_dataframe(session, upload_id=upload_id, workspace_id=up.workspace_id)
    metrics = compute_metrics_bundle(df, smap)
    return ImportRunResponse(
        upload_id=upload_id,
        job_id=job.id,
        qualified_table=result["qualified_table"],
        row_count=int(result["row_count"]),
        semantic_column_map=result.get("semantic_column_map") or {},
        metrics=metrics,
    )


@data_router.post("/notebooks/{notebook_id}/link-upload", response_model=NotebookLinkUploadResponse)
def link_upload_to_notebook(
    notebook_id: uuid.UUID,
    body: NotebookLinkUploadRequest,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> NotebookLinkUploadResponse:
    _require_workspace(session, user.id, body.workspace_id)
    if not _notebook_access(session, user, notebook_id):
        raise ForbiddenException("No access to this notebook")
    repo = DataPipelineRepository(session)
    up = repo.get_upload(body.upload_id)
    if not up or up.workspace_id != body.workspace_id:
        raise NotFoundException("Upload not found")
    job = repo.get_latest_job_for_upload(body.upload_id)
    patch: dict = {
        "ds_upload_id": str(body.upload_id),
        "ds_workspace_id": str(body.workspace_id),
    }
    if job and (job.transform_config_json or {}).get("qualified_table"):
        patch["ds_staging_qualified"] = job.transform_config_json["qualified_table"]
    nb_repo = NotebookRepository(session)
    nb = nb_repo.merge_context_chain(notebook_id, patch)
    if not nb:
        raise NotFoundException("Notebook not found")
    session.commit()
    session.refresh(nb)
    return NotebookLinkUploadResponse(notebook_id=notebook_id, context_chain_json=dict(nb.context_chain_json or {}))


@forecast_router.post("/run", response_model=ForecastRunResponse)
def run_forecast(
    body: ForecastRunRequest,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> ForecastRunResponse:
    _require_workspace(session, user.id, body.workspace_id)
    ds = DataScienceForecastService(session)
    result = ds.run(
        workspace_id=body.workspace_id,
        upload_id=body.upload_id,
        user=user,
        horizon_days=body.horizon_days,
        preferred_strategy=body.preferred_strategy,
        date_column=body.date_column,
        notebook_id=body.notebook_id,
        source_table=body.source_table or settings.ds_default_source_table,
    )
    session.commit()

    return ForecastRunResponse(
        forecast_run_id=result.forecast_run_id,
        workspace_id=body.workspace_id,
        upload_id=body.upload_id,
        source_table=body.source_table or settings.ds_default_source_table,
        date_column=result.date_column,
        semantic_column_map=result.semantic_column_map,
        metrics=result.metrics,
        forecasts=result.forecasts,
        strategy_summary={
            "model_family": "deterministic_mvp",
            "methods": list((result.forecasts or {}).get("strategies") or []),
            "selected_strategy": body.preferred_strategy,
            "explainability": "Each method uses transparent arithmetic/trend logic; no black-box ML.",
        },
        insights=result.insights,
    )


@forecast_router.post("/automl-backtest", response_model=AutoMLBacktestResponse)
def run_forecast_automl_backtest(
    body: AutoMLBacktestRequest,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> AutoMLBacktestResponse:
    _require_workspace(session, user.id, body.workspace_id)
    ds = DataScienceForecastService(session)
    result = ds.run_automl_backtest(
        workspace_id=body.workspace_id,
        upload_id=body.upload_id,
        user=user,
        horizon_days=body.horizon_days,
        holdout_days=body.holdout_days,
        strategies=body.strategies,
        date_column=body.date_column,
        source_table=body.source_table or settings.ds_default_source_table,
    )
    return AutoMLBacktestResponse(**result)


@forecast_router.get("/runs/{forecast_run_id}", response_model=ForecastRunDetailResponse)
def get_forecast_run_detail(
    forecast_run_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> ForecastRunDetailResponse:
    repo = DataPipelineRepository(session)
    run = repo.get_forecast_run(forecast_run_id)
    if not run:
        raise NotFoundException("Forecast run not found")
    _require_workspace(session, user.id, run.workspace_id)

    points_raw = repo.list_forecast_results(run.id)
    points = [
        ForecastResultPoint(
            step_index=p.step_index,
            forecast_timestamp=p.forecast_timestamp,
            predicted_value=float(p.predicted_value),
            lower_bound=float(p.lower_bound) if p.lower_bound is not None else None,
            upper_bound=float(p.upper_bound) if p.upper_bound is not None else None,
            confidence_score=float(p.confidence_score) if p.confidence_score is not None else None,
            components=dict(p.components_json or {}),
        )
        for p in points_raw
    ]

    anomalies_raw = repo.list_anomaly_events_for_run(run.id)
    anomalies = [
        {
            "id": str(a.id),
            "severity": a.severity,
            "event_type": a.event_type,
            "title": a.title,
            "description": a.description,
            "payload": dict(a.payload_json or {}),
            "detected_at": a.detected_at.isoformat() if a.detected_at else None,
        }
        for a in anomalies_raw
    ]

    return ForecastRunDetailResponse(
        forecast_run_id=run.id,
        workspace_id=run.workspace_id,
        notebook_id=run.notebook_id,
        report_id=run.report_id,
        metric_key=run.metric_key,
        method=run.method,
        horizon_steps=run.horizon_steps,
        run_status=run.run_status,
        parameters=dict(run.parameters_json or {}),
        metadata=dict(run.forecast_metadata_json or {}),
        created_by=run.created_by,
        started_at=run.started_at,
        finished_at=run.finished_at,
        created_at=run.created_at,
        points=points,
        anomalies=anomalies,
    )


@forecast_router.get("/runs", response_model=ForecastRunListResponse)
def list_forecast_runs(
    workspace_id: uuid.UUID,
    limit: int = 20,
    offset: int = 0,
    status: Optional[str] = None,
    metric_key: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    sort: Literal["created_at", "horizon_steps"] = "created_at",
    order: Literal["asc", "desc"] = "desc",
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> ForecastRunListResponse:
    _require_workspace(session, user.id, workspace_id)
    capped_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    if date_from is not None and date_from.tzinfo is None:
        date_from = date_from.replace(tzinfo=timezone.utc)
    if date_to is not None and date_to.tzinfo is None:
        date_to = date_to.replace(tzinfo=timezone.utc)
    repo = DataPipelineRepository(session)
    runs = repo.list_forecast_runs(
        workspace_id=workspace_id,
        limit=capped_limit,
        offset=safe_offset,
        status=status,
        metric_key=metric_key,
        date_from=date_from,
        date_to=date_to,
        sort=sort,
        order=order,
    )
    total = repo.count_forecast_runs(
        workspace_id=workspace_id,
        status=status,
        metric_key=metric_key,
        date_from=date_from,
        date_to=date_to,
    )

    out: list[ForecastRunListItem] = []
    for run in runs:
        points_count = len(repo.list_forecast_results(run.id))
        anomalies_count = len(repo.list_anomaly_events_for_run(run.id))
        out.append(
            ForecastRunListItem(
                forecast_run_id=run.id,
                workspace_id=run.workspace_id,
                notebook_id=run.notebook_id,
                report_id=run.report_id,
                metric_key=run.metric_key,
                method=run.method,
                horizon_steps=run.horizon_steps,
                run_status=run.run_status,
                created_at=run.created_at,
                started_at=run.started_at,
                finished_at=run.finished_at,
                points_count=points_count,
                anomalies_count=anomalies_count,
            )
        )
    return ForecastRunListResponse(items=out, total=total, limit=capped_limit, offset=safe_offset)
