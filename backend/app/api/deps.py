from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_active_user, get_user_repository, require_capability, require_roles
from app.db.session import get_db_session
from app.repositories.notebook_repository import NotebookRepository
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.repositories.workspace_repository import WorkspaceRepository
from app.services.auth_service import AuthService
from app.services.notebook_service import NotebookService

__all__ = [
    "get_db_session",
    "get_user_repository",
    "get_role_repository",
    "get_auth_service",
    "get_current_active_user",
    "require_roles",
    "require_capability",
    "get_workspace_repository",
    "get_notebook_repository",
    "get_notebook_service",
]


def get_role_repository(session: Session = Depends(get_db_session)) -> RoleRepository:
    return RoleRepository(session)


def get_auth_service(
    users: UserRepository = Depends(get_user_repository),
    roles: RoleRepository = Depends(get_role_repository),
) -> AuthService:
    return AuthService(users, roles)


def get_workspace_repository(session: Session = Depends(get_db_session)) -> WorkspaceRepository:
    return WorkspaceRepository(session)


def get_notebook_repository(session: Session = Depends(get_db_session)) -> NotebookRepository:
    return NotebookRepository(session)


def get_notebook_service(
    workspaces: WorkspaceRepository = Depends(get_workspace_repository),
    notebooks: NotebookRepository = Depends(get_notebook_repository),
) -> NotebookService:
    return NotebookService(workspaces, notebooks)
