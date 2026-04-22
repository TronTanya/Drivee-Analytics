from __future__ import annotations

from sqlalchemy import select

from app.models.semantic import SemanticTerm
from app.repositories.base import BaseRepository


class SemanticTermRepository(BaseRepository):
    def list_active(self, *, workspace_id) -> list[SemanticTerm]:
        stmt = (
            select(SemanticTerm)
            .where(SemanticTerm.workspace_id == workspace_id, SemanticTerm.is_active.is_(True))
            .order_by(SemanticTerm.term_key.asc())
        )
        return list(self.session.scalars(stmt))
