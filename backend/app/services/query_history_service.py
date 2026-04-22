from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.notebook import Notebook, NotebookCell
from app.schemas.reporting import HistoryItemResponse


def list_query_history(
    session: Session,
    *,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    limit: int = 100,
) -> list[HistoryItemResponse]:
    stmt = (
        select(NotebookCell)
        .join(Notebook, NotebookCell.notebook_id == Notebook.id)
        .where(
            Notebook.workspace_id == workspace_id,
            Notebook.owner_user_id == user_id,
            NotebookCell.cell_type == "prompt",
        )
        .order_by(desc(NotebookCell.updated_at))
        .limit(limit)
    )
    rows = list(session.execute(stmt).scalars().all())
    out: list[HistoryItemResponse] = []
    for cell in rows:
        orch = (cell.trace_payload_json or {}).get("orchestration") or {}
        intent = cell.interpreted_intent if isinstance(cell.interpreted_intent, dict) else {}
        if not intent and orch.get("intent"):
            intent = {"intent": orch.get("intent"), "entities": orch.get("entities")}
        sql_preview = (cell.generated_sql or "")[:500]
        ts: datetime = cell.updated_at or cell.created_at
        title_guess = (cell.prompt_text or "Отчёт")[:80]
        out.append(
            HistoryItemResponse(
                id=cell.id,
                notebook_id=cell.notebook_id,
                original_query=cell.prompt_text or "",
                interpreted_intent=intent,
                generated_sql_preview=sql_preview,
                validation_status=cell.validation_status,
                execution_status=cell.execution_status,
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
