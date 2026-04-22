from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal, Optional

from sqlalchemy import desc, func, select

from app.models.analytics_history import InsightLog
from app.models.data_pipeline import DataImportJob, ForecastResult, ForecastRun, InferredSchema, UploadedFile
from app.models.metrics import AnomalyEvent, MetricSnapshot
from app.repositories.base import BaseRepository


class DataPipelineRepository(BaseRepository):
    def _forecast_runs_base_query(
        self,
        *,
        workspace_id: uuid.UUID,
        status: Optional[str] = None,
        metric_key: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ):
        stmt = select(ForecastRun).where(ForecastRun.workspace_id == workspace_id)
        if status:
            stmt = stmt.where(ForecastRun.run_status == status)
        if metric_key:
            stmt = stmt.where(ForecastRun.metric_key == metric_key)
        if date_from:
            stmt = stmt.where(ForecastRun.created_at >= date_from)
        if date_to:
            stmt = stmt.where(ForecastRun.created_at <= date_to)
        return stmt

    def add_upload(self, row: UploadedFile) -> UploadedFile:
        self.session.add(row)
        self.session.flush()
        return row

    def get_upload(self, upload_id: uuid.UUID) -> Optional[UploadedFile]:
        return self.session.get(UploadedFile, upload_id)

    def list_uploads(self, workspace_id: uuid.UUID, limit: int = 100) -> list[UploadedFile]:
        stmt = (
            select(UploadedFile)
            .where(UploadedFile.workspace_id == workspace_id)
            .order_by(desc(UploadedFile.created_at))
            .limit(limit)
        )
        return list(self.session.execute(stmt).scalars().all())

    def add_job(self, row: DataImportJob) -> DataImportJob:
        self.session.add(row)
        self.session.flush()
        return row

    def get_job(self, job_id: uuid.UUID) -> Optional[DataImportJob]:
        return self.session.get(DataImportJob, job_id)

    def get_latest_job_for_upload(self, upload_id: uuid.UUID) -> Optional[DataImportJob]:
        stmt = (
            select(DataImportJob)
            .where(DataImportJob.uploaded_file_id == upload_id)
            .order_by(desc(DataImportJob.created_at))
            .limit(1)
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def add_inferred(self, row: InferredSchema) -> InferredSchema:
        self.session.add(row)
        self.session.flush()
        return row

    def add_forecast_run(self, row: ForecastRun) -> ForecastRun:
        self.session.add(row)
        self.session.flush()
        return row

    def add_forecast_result(self, row: ForecastResult) -> ForecastResult:
        self.session.add(row)
        self.session.flush()
        return row

    def get_forecast_run(self, run_id: uuid.UUID) -> Optional[ForecastRun]:
        return self.session.get(ForecastRun, run_id)

    def list_forecast_results(self, run_id: uuid.UUID) -> list[ForecastResult]:
        stmt = (
            select(ForecastResult)
            .where(ForecastResult.forecast_run_id == run_id)
            .order_by(ForecastResult.step_index.asc())
        )
        return list(self.session.execute(stmt).scalars().all())

    def list_anomaly_events_for_run(self, run_id: uuid.UUID) -> list[AnomalyEvent]:
        stmt = (
            select(AnomalyEvent)
            .where(AnomalyEvent.forecast_run_id == run_id)
            .order_by(desc(AnomalyEvent.detected_at))
        )
        return list(self.session.execute(stmt).scalars().all())

    def list_forecast_runs(
        self,
        workspace_id: uuid.UUID,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
        metric_key: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        sort: Literal["created_at", "horizon_steps"] = "created_at",
        order: Literal["asc", "desc"] = "desc",
    ) -> list[ForecastRun]:
        stmt = self._forecast_runs_base_query(
            workspace_id=workspace_id,
            status=status,
            metric_key=metric_key,
            date_from=date_from,
            date_to=date_to,
        )
        sort_col = ForecastRun.horizon_steps if sort == "horizon_steps" else ForecastRun.created_at
        stmt = stmt.order_by(sort_col.asc() if order == "asc" else sort_col.desc()).offset(offset).limit(limit)
        return list(self.session.execute(stmt).scalars().all())

    def count_forecast_runs(
        self,
        workspace_id: uuid.UUID,
        *,
        status: Optional[str] = None,
        metric_key: Optional[str] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> int:
        base = self._forecast_runs_base_query(
            workspace_id=workspace_id,
            status=status,
            metric_key=metric_key,
            date_from=date_from,
            date_to=date_to,
        ).subquery()
        stmt = select(func.count()).select_from(base)
        result = self.session.execute(stmt).scalar_one()
        return int(result or 0)

    def add_metric_snapshot(self, row: MetricSnapshot) -> MetricSnapshot:
        self.session.add(row)
        self.session.flush()
        return row

    def add_anomaly_event(self, row: AnomalyEvent) -> AnomalyEvent:
        self.session.add(row)
        self.session.flush()
        return row

    def add_insight_log(self, row: InsightLog) -> InsightLog:
        self.session.add(row)
        self.session.flush()
        return row
