from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import delete, desc, select
from sqlalchemy.orm import selectinload

from app.models.saved_report import ReportSchedule, SavedReport
from app.repositories.base import BaseRepository


class SavedReportRepository(BaseRepository):
    def create(self, row: SavedReport) -> SavedReport:
        self.session.add(row)
        self.session.flush()
        return row

    def get(self, report_id: uuid.UUID) -> Optional[SavedReport]:
        stmt = (
            select(SavedReport)
            .where(SavedReport.id == report_id)
            .options(selectinload(SavedReport.schedules))
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def list_for_workspace(self, workspace_id: uuid.UUID, limit: int = 100) -> list[SavedReport]:
        stmt = (
            select(SavedReport)
            .where(SavedReport.workspace_id == workspace_id)
            .options(selectinload(SavedReport.schedules))
            .order_by(desc(SavedReport.updated_at))
            .limit(limit)
        )
        return list(self.session.execute(stmt).scalars().all())

    def delete_schedules_for_report(self, report_id: uuid.UUID) -> None:
        self.session.execute(delete(ReportSchedule).where(ReportSchedule.report_id == report_id))

    def add_schedule(self, row: ReportSchedule) -> ReportSchedule:
        self.session.add(row)
        self.session.flush()
        return row

    def get_schedule_for_report(self, report_id: uuid.UUID) -> Optional[ReportSchedule]:
        stmt = (
            select(ReportSchedule)
            .where(ReportSchedule.report_id == report_id)
            .order_by(desc(ReportSchedule.updated_at))
            .limit(1)
        )
        return self.session.execute(stmt).scalar_one_or_none()
