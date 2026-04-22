from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal, Optional

from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenException, ValidationException
from app.models.saved_report import ReportSchedule
from app.models.user import User
from app.repositories.notebook_repository import NotebookRepository
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.reporting import (
    RunReportResponse,
    SavedReportCreate,
    ScheduleCreate,
    SchedulePatch,
    ScheduleResponse,
)
from app.services.analytics_pipeline import analyze_natural_language
from app.utils.schedule_cron import compute_next_run_utc, frequency_to_cron


def _require_workspace(session: Session, user_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
    if not WorkspaceRepository(session).user_has_workspace_access(user_id, workspace_id):
        raise ForbiddenException("No access to this workspace")


def _can_access_notebook(session: Session, user: User, notebook_id: uuid.UUID) -> bool:
    nb_repo = NotebookRepository(session)
    notebook = nb_repo.get_by_id(notebook_id)
    if not notebook:
        return False
    if notebook.owner_user_id == user.id:
        return True
    return WorkspaceRepository(session).user_has_workspace_access(user.id, notebook.workspace_id)


def resolve_report_payload(
    session: Session,
    user: User,
    body: SavedReportCreate,
) -> tuple[dict[str, Any], Optional[uuid.UUID]]:
    if body.source_cell_id:
        cell = NotebookRepository(session).get_cell_in_workspace(body.source_cell_id, body.workspace_id)
        if not cell or cell.cell_type != "prompt":
            raise ValidationException("source_cell_id must reference a prompt cell in this workspace")
        if not _can_access_notebook(session, user, cell.notebook_id):
            raise ForbiddenException("No access to notebook for this cell")
        ctx = dict(cell.context_snapshot_json or {})
        payload = {
            "prompt": (cell.prompt_text or "").strip(),
            "notebook_context": ctx,
            "role_key": None,
            "source_cell_id": str(cell.id),
            "source_notebook_id": str(cell.notebook_id),
        }
        if not payload["prompt"] and body.payload:
            payload["prompt"] = body.payload.prompt
        if not payload["prompt"]:
            raise ValidationException("Cannot save report: empty prompt on source cell")
        return payload, cell.notebook_id

    if body.payload:
        p = body.payload
        d = p.model_dump()
        if body.notebook_id:
            d["source_notebook_id"] = str(body.notebook_id)
        return d, body.notebook_id

    raise ValidationException("Provide payload or source_cell_id")


def run_saved_report_payload(
    session: Session,
    user: User,
    workspace_id: uuid.UUID,
    payload: dict[str, Any],
    report_id: Optional[uuid.UUID] = None,
) -> RunReportResponse:
    prompt = (payload.get("prompt") or "").strip()
    if not prompt:
        raise ValidationException("Report payload missing prompt")
    ctx = dict(payload.get("notebook_context") or {})
    role_key = payload.get("role_key") or (user.role.role_key if user.role else None)
    result = analyze_natural_language(
        prompt,
        notebook_context=ctx,
        workspace_id=str(workspace_id),
        role_key=role_key,
        db_session=session,
    )
    return RunReportResponse(
        report_id=report_id or uuid.UUID(int=0),
        execution_status=result.execution_status,
        safe_sql=result.safe_sql,
        insight=result.insight,
        chart_type=result.chart_type,
        table_records=list(result.table_records),
        confidence=result.confidence,
        warnings=list(result.warnings),
        trace_summary=result.trace_summary,
        clarification_required=result.clarification_required,
    )


def schedule_to_response(row: ReportSchedule) -> ScheduleResponse:
    cfg = dict(row.delivery_config_json or {})
    return ScheduleResponse(
        id=row.id,
        report_id=row.report_id,
        cron_expression=row.cron_expression,
        timezone=row.timezone,
        is_active=row.is_active,
        delivery_channel=row.delivery_channel,
        delivery_config_json=cfg,
        last_run_at=row.last_run_at,
        next_run_at=row.next_run_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
        frequency=cfg.get("frequency"),
        hour_utc=cfg.get("hour_utc"),
        minute_utc=cfg.get("minute_utc"),
    )


def build_schedule_row(
    report_id: uuid.UUID,
    body: ScheduleCreate,
) -> ReportSchedule:
    cron = frequency_to_cron(
        body.frequency,
        body.hour_utc,
        body.minute_utc,
        day_of_week=body.day_of_week,
        day_of_month=body.day_of_month,
    )
    nextrun = compute_next_run_utc(
        body.frequency,
        body.hour_utc,
        body.minute_utc,
        day_of_week=body.day_of_week,
        day_of_month=body.day_of_month,
    )
    cfg = dict(body.delivery_config_json)
    cfg.update(
        {
            "frequency": body.frequency,
            "hour_utc": body.hour_utc,
            "minute_utc": body.minute_utc,
            "day_of_week": body.day_of_week,
            "day_of_month": body.day_of_month,
        }
    )
    if body.delivery_channel == "email_mock":
        cfg.setdefault("mock_delivery_log", []).append({"status": "pending_mock"})
    return ReportSchedule(
        report_id=report_id,
        cron_expression=cron,
        timezone="UTC",
        is_active=body.is_active,
        delivery_channel=body.delivery_channel,
        delivery_config_json=cfg,
        next_run_at=nextrun,
    )


def patch_schedule_row(row: ReportSchedule, patch: SchedulePatch) -> None:
    cfg = dict(row.delivery_config_json or {})
    freq = patch.frequency or cfg.get("frequency") or "daily"
    hour = patch.hour_utc if patch.hour_utc is not None else cfg.get("hour_utc", 9)
    minute = patch.minute_utc if patch.minute_utc is not None else cfg.get("minute_utc", 0)
    dow = patch.day_of_week if patch.day_of_week is not None else cfg.get("day_of_week", 0)
    dom = patch.day_of_month if patch.day_of_month is not None else cfg.get("day_of_month", 1)
    if patch.delivery_channel is not None:
        row.delivery_channel = patch.delivery_channel
    if patch.is_active is not None:
        row.is_active = patch.is_active
    if patch.delivery_config_json is not None:
        cfg.update(patch.delivery_config_json)

    cfg["frequency"] = freq
    cfg["hour_utc"] = hour
    cfg["minute_utc"] = minute
    cfg["day_of_week"] = dow
    cfg["day_of_month"] = dom

    row.cron_expression = frequency_to_cron(freq, hour, minute, day_of_week=dow, day_of_month=dom)
    row.next_run_at = compute_next_run_utc(freq, hour, minute, day_of_week=dow, day_of_month=dom)
    row.delivery_config_json = cfg


ReportPdfMode = Literal["compact", "board"]


def render_report_pdf_bytes(
    *,
    report_title: str,
    report_description: Optional[str],
    report_payload: dict[str, Any],
    execution_snapshot: Optional[dict[str, Any]] = None,
    mode: ReportPdfMode = "board",
) -> bytes:
    """Build report PDF payload without external dependencies."""
    sections = _build_report_sections(
        report_title=report_title,
        report_description=report_description,
        report_payload=report_payload,
        execution_snapshot=execution_snapshot,
    )
    if mode == "compact":
        content_stream = _pdf_stream_compact(_flatten_sections_to_lines(sections))
    else:
        content_stream = _pdf_stream_from_sections(sections)

    objects: list[bytes] = []
    objects.append(b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n")
    objects.append(b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n")
    objects.append(
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
    )
    objects.append(b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n")
    objects.append(
        b"5 0 obj << /Length "
        + str(len(content_stream)).encode("ascii")
        + b" >> stream\n"
        + content_stream
        + b"\nendstream endobj\n"
    )

    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(output))
        output.extend(obj)

    xref_start = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        (
            "trailer\n"
            f"<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            "startxref\n"
            f"{xref_start}\n"
            "%%EOF\n"
        ).encode("ascii")
    )
    return bytes(output)


def _pdf_text(value: str) -> str:
    safe = value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    return "".join(ch if 32 <= ord(ch) <= 126 else "?" for ch in safe)[:220]


def _build_report_sections(
    *,
    report_title: str,
    report_description: Optional[str],
    report_payload: dict[str, Any],
    execution_snapshot: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    prompt = str((report_payload or {}).get("prompt") or "Нет prompt в payload")
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    snap = execution_snapshot or {}

    summary = [
        f"Execution status: {snap.get('execution_status', '-')}",
        f"Chart type: {snap.get('chart_type', '-')}",
        f"Confidence: {snap.get('confidence', '-')}",
    ]
    summary.extend(_extract_kpi_lines(snap.get("table_records") or []))

    warnings = [str(w) for w in (snap.get("warnings") or [])][:6]
    insight = str(snap.get("insight") or "").strip()
    safe_sql = str(snap.get("safe_sql") or "").strip()
    trace_summary = str(snap.get("trace_summary") or "").strip()
    table_preview = _table_preview_lines(snap.get("table_records") or [])

    return {
        "title": report_title,
        "generated_at": now,
        "description": report_description or "Без описания",
        "prompt": prompt,
        "summary": summary,
        "warnings": warnings,
        "insight": insight,
        "sql": safe_sql,
        "trace": trace_summary,
        "table_preview": table_preview,
    }


def _pdf_stream_from_sections(sections: dict[str, Any]) -> bytes:
    parts: list[str] = []
    y = 792

    def draw_header_band() -> None:
        nonlocal y
        parts.append("q 0.93 g 0 732 612 60 re f Q")
        parts.append("BT /F1 16 Tf 72 770 Td ({}) Tj ET".format(_pdf_text(f"Drivee Analytics - {sections['title']}")))
        parts.append("BT /F1 10 Tf 72 752 Td ({}) Tj ET".format(_pdf_text(f"Generated: {sections['generated_at']}")))
        y = 716

    def section_heading(text: str) -> None:
        nonlocal y
        if y < 110:
            return
        parts.append(f"q 0.85 G 72 {y+4} m 540 {y+4} l S Q")
        parts.append("BT /F1 11 Tf 72 {} Td ({}) Tj ET".format(y - 10, _pdf_text(text)))
        y -= 26

    def block(lines: list[str], width: int = 96) -> None:
        nonlocal y
        for raw in lines:
            if y < 70:
                break
            wrapped = _wrap_for_pdf(raw, width=width)
            for line in wrapped:
                if y < 70:
                    break
                parts.append("BT /F1 10 Tf 72 {} Td ({}) Tj ET".format(y, _pdf_text(line)))
                y -= 13
            y -= 3

    draw_header_band()
    section_heading("DESCRIPTION")
    block([str(sections.get("description", ""))], width=96)

    section_heading("PROMPT")
    block([str(sections.get("prompt", ""))], width=96)

    section_heading("EXECUTION SUMMARY")
    block([str(x) for x in sections.get("summary", [])], width=96)

    warnings = [str(x) for x in sections.get("warnings", [])]
    if warnings:
        section_heading("WARNINGS")
        block([f"- {w}" for w in warnings], width=96)

    insight = str(sections.get("insight", "")).strip()
    if insight:
        section_heading("INSIGHT")
        block([insight], width=96)

    sql = str(sections.get("sql", "")).strip()
    if sql:
        section_heading("SQL")
        block([sql], width=96)

    trace = str(sections.get("trace", "")).strip()
    if trace:
        section_heading("TRACE")
        block([trace], width=96)

    preview = [str(x) for x in sections.get("table_preview", [])]
    if preview:
        section_heading("TABLE PREVIEW")
        parts.append("q 0.95 g 72 {} 468 {} re f Q".format(y - min(80, len(preview) * 12 + 8), min(80, len(preview) * 12 + 8)))
        block(preview, width=90)

    return "\n".join(parts).encode("latin-1", errors="replace")


def _flatten_sections_to_lines(sections: dict[str, Any]) -> list[str]:
    lines = [
        f"Drivee Analytics - {sections.get('title', '')}",
        f"Сгенерировано: {sections.get('generated_at', '')}",
        f"Описание: {sections.get('description', '')}",
        "",
        "PROMPT",
        str(sections.get("prompt", "")),
        "",
        "EXECUTION SUMMARY",
    ]
    lines.extend([str(x) for x in sections.get("summary", [])])
    warnings = [str(x) for x in sections.get("warnings", [])]
    if warnings:
        lines.append("WARNINGS")
        lines.extend([f"- {w}" for w in warnings])
    insight = str(sections.get("insight", "")).strip()
    if insight:
        lines.extend(["", "INSIGHT", insight])
    sql = str(sections.get("sql", "")).strip()
    if sql:
        lines.extend(["", "SQL", sql])
    trace = str(sections.get("trace", "")).strip()
    if trace:
        lines.extend(["", "TRACE", trace])
    preview = [str(x) for x in sections.get("table_preview", [])]
    if preview:
        lines.extend(["", "TABLE PREVIEW"])
        lines.extend(preview)
    return lines


def _pdf_stream_compact(lines: list[str]) -> bytes:
    y = 770
    chunks: list[str] = ["BT", "/F1 10 Tf"]
    for raw in lines:
        if y < 60:
            break
        wrapped = _wrap_for_pdf(raw, width=100)
        if not wrapped:
            chunks.append(f"72 {y} Td () Tj")
            chunks.append("0 0 Td")
            y -= 13
            continue
        for line in wrapped:
            if y < 60:
                break
            chunks.append(f"72 {y} Td ({_pdf_text(line)}) Tj")
            chunks.append("0 0 Td")
            y -= 13
    chunks.append("ET")
    return "\n".join(chunks).encode("latin-1", errors="replace")


def _extract_kpi_lines(table_records: list[Any]) -> list[str]:
    if not table_records or not isinstance(table_records[0], dict):
        return []
    numeric_totals: dict[str, float] = {}
    numeric_counts: dict[str, int] = {}
    for row in table_records[:30]:
        if not isinstance(row, dict):
            continue
        for key, value in row.items():
            num = _to_float(value)
            if num is None:
                continue
            numeric_totals[key] = numeric_totals.get(key, 0.0) + num
            numeric_counts[key] = numeric_counts.get(key, 0) + 1
    lines: list[str] = []
    for key in list(numeric_totals.keys())[:3]:
        cnt = numeric_counts[key]
        total = numeric_totals[key]
        avg = total / cnt if cnt else 0.0
        lines.append(f"KPI {key}: sum={total:.2f}; avg={avg:.2f}")
    return lines


def _table_preview_lines(table_records: list[Any]) -> list[str]:
    if not table_records:
        return []
    rows = table_records[:5]
    if isinstance(rows[0], dict):
        keys = list(rows[0].keys())[:4]
        out = [" | ".join(keys)]
        out.append("-" * min(88, len(out[0])))
        for row in rows:
            if not isinstance(row, dict):
                out.append(str(row))
                continue
            vals = [str(row.get(k, "")) for k in keys]
            out.append(" | ".join(vals))
        return out
    return [str(r) for r in rows]


def _to_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _wrap_for_pdf(text: str, width: int = 96) -> list[str]:
    s = text.strip()
    if not s:
        return [""]
    words = s.split()
    out: list[str] = []
    cur = words[0]
    for w in words[1:]:
        if len(cur) + 1 + len(w) <= width:
            cur = f"{cur} {w}"
        else:
            out.append(cur)
            cur = w
    out.append(cur)
    return out


__all__ = [
    "_require_workspace",
    "resolve_report_payload",
    "run_saved_report_payload",
    "render_report_pdf_bytes",
    "ReportPdfMode",
    "schedule_to_response",
    "build_schedule_row",
    "patch_schedule_row",
]
