from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.models.query_template import QueryTemplate
from app.repositories.base import BaseRepository


class QueryTemplateRepository(BaseRepository):
    def list_for_workspace_and_role(
        self,
        workspace_id: uuid.UUID,
        user_role_id: uuid.UUID,
    ) -> list[QueryTemplate]:
        stmt = (
            select(QueryTemplate)
            .options(selectinload(QueryTemplate.target_role))
            .where(
                QueryTemplate.workspace_id == workspace_id,
                or_(
                    QueryTemplate.target_role_id.is_(None),
                    QueryTemplate.target_role_id == user_role_id,
                ),
            )
            .order_by(QueryTemplate.template_name.asc())
        )
        return list(self.session.execute(stmt).scalars().all())

    def get_in_workspace(self, template_id: uuid.UUID, workspace_id: uuid.UUID) -> Optional[QueryTemplate]:
        stmt = (
            select(QueryTemplate)
            .options(selectinload(QueryTemplate.target_role))
            .where(
                QueryTemplate.id == template_id,
                QueryTemplate.workspace_id == workspace_id,
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()
