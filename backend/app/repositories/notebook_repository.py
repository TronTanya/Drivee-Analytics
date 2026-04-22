from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.notebook import CellRun, Notebook, NotebookCell
from app.repositories.base import BaseRepository


class NotebookRepository(BaseRepository):
    def create_notebook(self, notebook: Notebook) -> Notebook:
        self.session.add(notebook)
        self.session.flush()
        return notebook

    def get_by_id(self, notebook_id: uuid.UUID) -> Optional[Notebook]:
        statement = select(Notebook).where(Notebook.id == notebook_id)
        return self.session.execute(statement).scalar_one_or_none()

    def get_by_id_with_cells(self, notebook_id: uuid.UUID) -> Optional[Notebook]:
        statement = (
            select(Notebook)
            .where(Notebook.id == notebook_id)
            .options(selectinload(Notebook.cells))
        )
        return self.session.execute(statement).scalar_one_or_none()

    def list_for_workspace(self, workspace_id: uuid.UUID, limit: int = 100) -> list[Notebook]:
        statement = (
            select(Notebook)
            .where(Notebook.workspace_id == workspace_id)
            .order_by(Notebook.updated_at.desc())
            .limit(limit)
        )
        return list(self.session.execute(statement).scalars().all())

    def max_cell_position(self, notebook_id: uuid.UUID) -> int:
        statement = select(func.coalesce(func.max(NotebookCell.position), 0)).where(
            NotebookCell.notebook_id == notebook_id
        )
        result = self.session.execute(statement).scalar_one()
        return int(result or 0)

    def add_cell(self, cell: NotebookCell) -> NotebookCell:
        self.session.add(cell)
        self.session.flush()
        return cell

    def get_cell(self, notebook_id: uuid.UUID, cell_id: uuid.UUID) -> Optional[NotebookCell]:
        statement = select(NotebookCell).where(
            NotebookCell.notebook_id == notebook_id,
            NotebookCell.id == cell_id,
        )
        return self.session.execute(statement).scalar_one_or_none()

    def get_cell_in_workspace(self, cell_id: uuid.UUID, workspace_id: uuid.UUID) -> Optional[NotebookCell]:
        statement = (
            select(NotebookCell)
            .join(Notebook, NotebookCell.notebook_id == Notebook.id)
            .where(NotebookCell.id == cell_id, Notebook.workspace_id == workspace_id)
        )
        return self.session.execute(statement).scalar_one_or_none()

    def list_cells_ordered(self, notebook_id: uuid.UUID) -> list[NotebookCell]:
        statement = (
            select(NotebookCell)
            .where(NotebookCell.notebook_id == notebook_id)
            .order_by(NotebookCell.position.asc())
        )
        return list(self.session.execute(statement).scalars().all())

    def next_cell_run_number(self, cell_id: uuid.UUID) -> int:
        statement = select(func.coalesce(func.max(CellRun.run_number), 0)).where(CellRun.cell_id == cell_id)
        current = self.session.execute(statement).scalar_one()
        return int(current or 0) + 1

    def add_cell_run(self, run: CellRun) -> CellRun:
        self.session.add(run)
        self.session.flush()
        return run

    def merge_context_chain(self, notebook_id: uuid.UUID, patch: dict) -> Optional[Notebook]:
        notebook = self.get_by_id(notebook_id)
        if not notebook:
            return None
        ctx = dict(notebook.context_chain_json or {})
        ctx.update(patch)
        notebook.context_chain_json = ctx
        self.session.add(notebook)
        self.session.flush()
        return notebook

    def list_prompt_execution_history(
        self,
        workspace_id: uuid.UUID,
        owner_user_id: uuid.UUID,
        *,
        limit: int = 200,
        days_back: Optional[int] = 90,
    ) -> list[NotebookCell]:
        """Successful prompt cells for auto-dashboard signals (personal history in workspace)."""
        stmt = (
            select(NotebookCell)
            .join(Notebook, NotebookCell.notebook_id == Notebook.id)
            .where(
                Notebook.workspace_id == workspace_id,
                Notebook.owner_user_id == owner_user_id,
                NotebookCell.cell_type == "prompt",
                NotebookCell.execution_status == "succeeded",
                NotebookCell.clarification_required.is_(False),
            )
            .order_by(NotebookCell.updated_at.desc())
            .limit(limit)
        )
        if days_back is not None and days_back > 0:
            cutoff = datetime.now(timezone.utc) - timedelta(days=days_back)
            stmt = stmt.where(NotebookCell.updated_at >= cutoff)
        return list(self.session.execute(stmt).scalars().all())
