from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import desc, select

from app.models.query_correction import QueryCorrection
from app.repositories.base import BaseRepository


class QueryCorrectionRepository(BaseRepository):
    def create(self, row: QueryCorrection) -> QueryCorrection:
        self.session.add(row)
        self.session.flush()
        return row

    def get(self, correction_id: uuid.UUID) -> Optional[QueryCorrection]:
        return self.session.get(QueryCorrection, correction_id)

    def list_for_workspace(self, workspace_id: uuid.UUID, limit: int = 500) -> list[QueryCorrection]:
        stmt = (
            select(QueryCorrection)
            .where(QueryCorrection.workspace_id == workspace_id)
            .order_by(desc(QueryCorrection.created_at))
            .limit(limit)
        )
        return list(self.session.execute(stmt).scalars().all())
