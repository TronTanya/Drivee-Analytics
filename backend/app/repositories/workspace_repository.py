from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy import select

from app.models.workspace import WorkspaceMembership
from app.repositories.base import BaseRepository


class WorkspaceRepository(BaseRepository):
    def get_default_workspace_id_for_user(self, user_id: uuid.UUID) -> Optional[uuid.UUID]:
        statement = (
            select(WorkspaceMembership.workspace_id)
            .where(WorkspaceMembership.user_id == user_id, WorkspaceMembership.is_default_workspace.is_(True))
            .limit(1)
        )
        found = self.session.execute(statement).scalar_one_or_none()
        if found:
            return found
        statement = select(WorkspaceMembership.workspace_id).where(WorkspaceMembership.user_id == user_id).limit(1)
        return self.session.execute(statement).scalar_one_or_none()

    def user_has_workspace_access(self, user_id: uuid.UUID, workspace_id: uuid.UUID) -> bool:
        statement = select(WorkspaceMembership.id).where(
            WorkspaceMembership.user_id == user_id,
            WorkspaceMembership.workspace_id == workspace_id,
        )
        return self.session.execute(statement).scalar_one_or_none() is not None
