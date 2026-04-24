from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_db_session
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.saved_report import SavedReport
from app.models.user import User
from app.repositories.saved_report_repository import SavedReportRepository
from app.schemas.reporting import (
    RunReportResponse,
    SavedReportCreate,
    SavedReportDetail,
    SavedReportListItem,
    ScheduleCreate,
    SchedulePatch,
    ScheduleResponse,
)
from app.services.report_delivery import record_schedule_delivery_stub
from app.services.report_service import (
    _require_workspace,
    build_schedule_row,
    patch_schedule_row,
    render_report_pdf_bytes,
    resolve_report_payload,
    run_saved_report_payload,
    schedule_to_response,
)

router = APIRouter(prefix="/reports", tags=["reports"])


def _creator_role_from_payload(payload: dict) -> str | None:
    raw = payload.get("creator_role_key")
    if raw is None:
        return None
    s = str(raw).strip()
    return s or None


def _infer_report_format(payload: dict) -> str:
    raw = (
        payload.get("format")
        or payload.get("export_format")
        or (payload.get("result_metadata") or {}).get("format")
        or (payload.get("result_metadata") or {}).get("export_format")
        or "pdf"
    )
    value = str(raw).strip().lower()
    if value in {"pdf", "csv", "slides", "notebook"}:
        return value
    return "pdf"


@router.post("", response_model=SavedReportDetail)
def create_report(
    body: SavedReportCreate,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> SavedReportDetail:
    _require_workspace(session, user.id, body.workspace_id)
    payload, nb_id = resolve_report_payload(session, user, body)
    payload = dict(payload or {})
    payload.setdefault("saved_at", datetime.now(timezone.utc).replace(microsecond=0).isoformat())
    if user.role and user.role.role_key:
        payload.setdefault("creator_role_key", user.role.role_key)
    payload.setdefault("creator_user_id", str(user.id))
    row = SavedReport(
        workspace_id=body.workspace_id,
        notebook_id=nb_id or body.notebook_id,
        title=body.title,
        description=body.description,
        report_payload_json=dict(payload),
        created_by=user.id,
        is_shared=False,
    )
    repo = SavedReportRepository(session)
    repo.create(row)
    session.commit()
    session.refresh(row)
    return _to_detail(session, row)


@router.get("", response_model=list[SavedReportListItem])
def list_reports(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> list[SavedReportListItem]:
    _require_workspace(session, user.id, workspace_id)
    rows = SavedReportRepository(session).list_for_workspace(workspace_id)
    return [
        SavedReportListItem(
            id=r.id,
            workspace_id=r.workspace_id,
            title=r.title,
            description=r.description,
            notebook_id=r.notebook_id,
            created_by=r.created_by,
            creator_role_key=_creator_role_from_payload(dict(r.report_payload_json or {})),
            is_shared=r.is_shared,
            created_at=r.created_at,
            updated_at=r.updated_at,
            has_schedule=bool(r.schedules),
            report_format=_infer_report_format(dict(r.report_payload_json or {})),
        )
        for r in rows
    ]


@router.get("/{report_id}", response_model=SavedReportDetail)
def get_report(
    report_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> SavedReportDetail:
    repo = SavedReportRepository(session)
    row = repo.get(report_id)
    if not row:
        raise NotFoundException("Report not found")
    _require_workspace(session, user.id, row.workspace_id)
    return _to_detail(session, row)


@router.post("/{report_id}/run", response_model=RunReportResponse)
def run_report(
    report_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> RunReportResponse:
    repo = SavedReportRepository(session)
    row = repo.get(report_id)
    if not row:
        raise NotFoundException("Report not found")
    _require_workspace(session, user.id, row.workspace_id)
    out = run_saved_report_payload(
        session,
        user,
        row.workspace_id,
        row.report_payload_json,
        report_id=row.id,
    )
    return out


@router.post("/{report_id}/schedule", response_model=ScheduleResponse)
def create_schedule(
    report_id: uuid.UUID,
    body: ScheduleCreate,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> ScheduleResponse:
    repo = SavedReportRepository(session)
    report = repo.get(report_id)
    if not report:
        raise NotFoundException("Report not found")
    _require_workspace(session, user.id, report.workspace_id)
    repo.delete_schedules_for_report(report_id)
    sched = build_schedule_row(report_id, body)
    repo.add_schedule(sched)
    session.flush()
    record_schedule_delivery_stub(sched, report_title=report.title)
    session.commit()
    session.refresh(sched)
    return schedule_to_response(sched)


@router.patch("/{report_id}/schedule", response_model=ScheduleResponse)
def patch_schedule(
    report_id: uuid.UUID,
    body: SchedulePatch,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> ScheduleResponse:
    repo = SavedReportRepository(session)
    report = repo.get(report_id)
    if not report:
        raise NotFoundException("Report not found")
    _require_workspace(session, user.id, report.workspace_id)
    row = repo.get_schedule_for_report(report_id)
    if not row:
        raise NotFoundException("Schedule not found for this report")
    patch_schedule_row(row, body)
    session.commit()
    session.refresh(row)
    return schedule_to_response(row)


@router.delete("/{report_id}", status_code=204, response_class=Response)
def delete_report(
    report_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> Response:
    repo = SavedReportRepository(session)
    row = repo.get(report_id)
    if not row:
        raise NotFoundException("Report not found")
    _require_workspace(session, user.id, row.workspace_id)
    if row.created_by and row.created_by != user.id:
        raise ForbiddenException("Нельзя удалить чужой отчёт")
    repo.delete(report_id)
    session.commit()
    return Response(status_code=204)


@router.delete("/{report_id}/schedule", status_code=204, response_class=Response)
def delete_schedule(
    report_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> Response:
    repo = SavedReportRepository(session)
    report = repo.get(report_id)
    if not report:
        raise NotFoundException("Report not found")
    _require_workspace(session, user.id, report.workspace_id)
    repo.delete_schedules_for_report(report_id)
    session.commit()
    return Response(status_code=204)


@router.get("/{report_id}/download")
def download_report_pdf(
    report_id: uuid.UUID,
    mode: Literal["compact", "board"] = Query(default="board"),
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> Response:
    repo = SavedReportRepository(session)
    row = repo.get(report_id)
    if not row:
        raise NotFoundException("Report not found")
    _require_workspace(session, user.id, row.workspace_id)

    execution_snapshot: dict[str, object]
    try:
        run_out = run_saved_report_payload(
            session,
            user,
            row.workspace_id,
            dict(row.report_payload_json or {}),
            report_id=row.id,
        )
        execution_snapshot = {
            "execution_status": run_out.execution_status,
            "safe_sql": run_out.safe_sql,
            "insight": run_out.insight,
            "chart_type": run_out.chart_type,
            "table_records": run_out.table_records,
            "confidence": run_out.confidence,
            "warnings": run_out.warnings,
            "trace_summary": run_out.trace_summary,
        }
    except Exception as exc:  # noqa: BLE001
        execution_snapshot = {
            "execution_status": "failed",
            "warnings": [f"Run step failed before PDF export: {type(exc).__name__}"],
        }

    pdf_bytes = render_report_pdf_bytes(
        report_title=row.title,
        report_description=row.description,
        report_payload=dict(row.report_payload_json or {}),
        execution_snapshot=execution_snapshot,
        mode=mode,
    )
    safe_name = "".join(ch if ch.isalnum() or ch in ("-", "_", " ") else "_" for ch in row.title).strip() or "report"
    file_name = f"{safe_name}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


def _to_detail(session: Session, row: SavedReport) -> SavedReportDetail:
    repo = SavedReportRepository(session)
    sched_row = repo.get_schedule_for_report(row.id)
    sched = schedule_to_response(sched_row) if sched_row else None
    return SavedReportDetail(
        id=row.id,
        workspace_id=row.workspace_id,
        title=row.title,
        description=row.description,
        notebook_id=row.notebook_id,
        report_payload_json=dict(row.report_payload_json or {}),
        created_by=row.created_by,
        is_shared=row.is_shared,
        created_at=row.created_at,
        updated_at=row.updated_at,
        schedule=sched,
    )
