from __future__ import annotations

from typing import Optional

from sqlalchemy import select

from app.models.role import Role
from app.repositories.base import BaseRepository


class RoleRepository(BaseRepository):
    def get_by_key(self, role_key: str) -> Optional[Role]:
        statement = select(Role).where(Role.role_key == role_key)
        return self.session.execute(statement).scalar_one_or_none()
