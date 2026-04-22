from __future__ import annotations

from sqlalchemy import select

from app.models.analytics_history import NLQueryHistory
from app.repositories.base import BaseRepository


class NLQueryHistoryRepository(BaseRepository):
    def create(self, item: NLQueryHistory) -> NLQueryHistory:
        self.session.add(item)
        self.session.flush()
        return item

    def list_recent(self, *, workspace_id, limit: int = 50) -> list[NLQueryHistory]:
        stmt = (
            select(NLQueryHistory)
            .where(NLQueryHistory.workspace_id == workspace_id)
            .order_by(NLQueryHistory.created_at.desc())
            .limit(limit)
        )
        return list(self.session.scalars(stmt))
