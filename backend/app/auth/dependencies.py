from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated, Optional

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_access_token
from app.db.session import get_db_session
from app.models.user import User
from app.repositories.user_repository import UserRepository


def get_user_repository(session: Session = Depends(get_db_session)) -> UserRepository:
    return UserRepository(session)


def _bearer_token(authorization: Optional[str] = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise UnauthorizedException("Missing or invalid Authorization header")
    return authorization.split(" ", 1)[1].strip()


def get_current_active_user(
    token: Annotated[str, Depends(_bearer_token)],
    users: Annotated[UserRepository, Depends(get_user_repository)],
) -> User:
    payload = decode_access_token(token)
    sub = payload.get("sub")
    if not sub:
        raise UnauthorizedException("Invalid token payload")
    try:
        user_id = uuid.UUID(sub)
    except ValueError as exc:
        raise UnauthorizedException("Invalid user id in token") from exc

    user = users.get_by_id(user_id)
    if not user:
        raise UnauthorizedException("User not found")
    if not user.is_active:
        raise UnauthorizedException("Account is disabled")
    return user


def require_roles(*allowed_role_keys: str) -> Callable[..., User]:
    allowed = set(allowed_role_keys)

    def _dependency(user: Annotated[User, Depends(get_current_active_user)]) -> User:
        if user.role.role_key not in allowed:
            raise ForbiddenException(
                "Insufficient permissions",
                details={"required_roles": sorted(allowed), "your_role": user.role.role_key},
            )
        return user

    return _dependency
