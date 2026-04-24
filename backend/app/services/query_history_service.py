from __future__ import annotations

import json
import uuid
from datetime import datetime, time, timezone
from typing import Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session, joinedload

from app.models.notebook import Notebook, NotebookCell
from app.schemas.reporting import HistoryItemResponse

_QUERY_TYPE_KEYWORDS: dict[str, tuple[str, ...]] = {
    "trips_by_city": ("поезд", "rides", "город", "city_id", "по город"),
    "cancellations": ("отмен", "cancel", "cancellation"),
    "conversion": ("конверс", "conversion", "дол", "share", "%"),
    "avg_check": ("средн", "чек", "avg", "price", "стоим"),
    "orders_trend": ("динамик", "заказ", "orders", "недел", "week", "тренд", "trend"),
}


def _haystack(cell: NotebookCell) -> str:
    parts = [cell.prompt_text or "", json.dumps(cell.interpreted_intent or {}, ensure_ascii=False)]
    exp = (cell.trace_payload_json or {}).get("explainability") or {}
    if isinstance(exp, dict):
        parts.append(str(exp.get("interpreted_intent") or ""))
    return " ".join(parts).lower()


def _matches_query_type(hay: str, query_type: str) -> bool:
    if query_type in ("", "all"):
        return True
    keys = _QUERY_TYPE_KEYWORDS.get(query_type)
    if not keys:
        return True
    return any(k in hay for k in keys)


def _interpreted_summary(cell: NotebookCell, intent: dict) -> str:
    exp = (cell.trace_payload_json or {}).get("explainability") or {}
    if isinstance(exp, dict):
        s = str(exp.get("interpreted_intent") or "").strip()
        if s:
            return s[:500]
    if isinstance(intent, dict):
        raw = intent.get("intent") or intent.get("summary")
        if raw:
            return str(raw)[:500]
    return ""


def _row_count_hint(cell: NotebookCell) -> Optional[int]:
    exp = (cell.trace_payload_json or {}).get("explainability") or {}
    if not isinstance(exp, dict):
        return None
    cols = exp.get("result_columns")
    if isinstance(cols, list) and cols:
        # нет точного rowcount в trace v1 — оставляем None или из orchestration
        pass
    orch = (cell.trace_payload_json or {}).get("orchestration") or {}
    if isinstance(orch, dict):
        rc = orch.get("result_row_count") or orch.get("row_count")
        if isinstance(rc, int):
            return rc
    return None


def list_query_history(
    session: Session,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    limit: int = 100,
    q: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    query_type: Optional[str] = None,
    owner_user_id: Optional[uuid.UUID] = None,
    scope: str = "mine",
    is_workspace_admin: bool = False,
) -> list[HistoryItemResponse]:
    """
    scope=mine — только ноутбуки владельца user_id.
    scope=workspace — все промпт-ячейки в workspace (только при is_workspace_admin).
    owner_user_id — доп. фильтр по владельцу ноутбука (для админов).
    """
    stmt = (
        select(NotebookCell)
        .join(Notebook, NotebookCell.notebook_id == Notebook.id)
        .options(joinedload(Notebook.owner))
        .where(
            Notebook.workspace_id == workspace_id,
            NotebookCell.cell_type.in_(("prompt", "analysis")),
        )
    )
    if scope == "workspace" and is_workspace_admin:
        pass
    else:
        stmt = stmt.where(Notebook.owner_user_id == user_id)

    if owner_user_id is not None:
        stmt = stmt.where(Notebook.owner_user_id == owner_user_id)

    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(NotebookCell.prompt_text.ilike(like))

    if date_from is not None:
        df = date_from if date_from.tzinfo else date_from.replace(tzinfo=timezone.utc)
        stmt = stmt.where(NotebookCell.updated_at >= df)
    if date_to is not None:
        dt = date_to if date_to.tzinfo else date_to.replace(tzinfo=timezone.utc)
        end_of_day = datetime.combine(dt.date(), time(23, 59, 59, 999999), tzinfo=dt.tzinfo)
        stmt = stmt.where(NotebookCell.updated_at <= end_of_day)

    stmt = stmt.order_by(desc(NotebookCell.updated_at)).limit(limit)
    rows = list(session.execute(stmt).scalars().all())

    out: list[HistoryItemResponse] = []
    for cell in rows:
        hay = _haystack(cell)
        if query_type and not _matches_query_type(hay, query_type):
            continue
        orch = (cell.trace_payload_json or {}).get("orchestration") or {}
        intent = cell.interpreted_intent if isinstance(cell.interpreted_intent, dict) else {}
        if not intent and orch.get("intent"):
            intent = {"intent": orch.get("intent"), "entities": orch.get("entities")}
        sql_preview = (cell.generated_sql or "")[:500]
        ts: datetime = cell.updated_at or cell.created_at
        title_guess = (cell.prompt_text or "Отчёт")[:80]
        nb = cell.notebook
        owner = nb.owner_user_id if nb else None
        author_role = None
        if nb and nb.owner and nb.owner.role:
            author_role = nb.owner.role.role_key
        conf_raw = cell.confidence_score
        conf_f = float(conf_raw) if conf_raw is not None else None
        insight = (cell.insight_text or "").strip() or None
        out.append(
            HistoryItemResponse(
                id=cell.id,
                notebook_id=cell.notebook_id,
                owner_user_id=owner,
                original_query=cell.prompt_text or "",
                interpreted_intent=intent,
                interpreted_summary=_interpreted_summary(cell, intent) or None,
                generated_sql_preview=sql_preview,
                chart_type=cell.chart_type or cell.selected_chart_type,
                table_row_count=_row_count_hint(cell),
                validation_status=cell.validation_status,
                execution_status=cell.execution_status,
                confidence=conf_f,
                result_summary=insight,
                author_role_key=author_role,
                created_at=ts,
                rerun_notebook_id=cell.notebook_id,
                rerun_cell_id=cell.id,
                save_as_report_body_hint={
                    "workspace_id": str(workspace_id),
                    "title": title_guess,
                    "source_cell_id": str(cell.id),
                    "notebook_id": str(cell.notebook_id),
                },
            )
        )
    return out
