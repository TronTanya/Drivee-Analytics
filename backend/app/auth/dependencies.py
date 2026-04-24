from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated, Optional

from fastapi import Depends, Header
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.services.guardrails.role_policy import assert_role_capability
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


def _demo_auth_enabled() -> bool:
    env = (settings.app_env or "").strip().lower()
    # Разрешаем bypass только в явно девелоперских окружениях.
    return bool(settings.demo_auth_bypass_enabled) and env in {"dev", "demo", "local", "test"}


def _resolve_demo_user(users: UserRepository) -> User:
    preferred = (settings.demo_auth_email or "").strip().lower()
    candidates: list[str] = [preferred] if preferred else []
    candidates.extend(
        [
            "manager@drivee.demo",
            "admin@drivee.demo",
            "marketer@drivee.demo",
            "executive@drivee.demo",
            "manager@drivee.local",
            "admin@drivee.local",
            "marketer@drivee.local",
            "executive@drivee.local",
        ]
    )
    seen: set[str] = set()
    for email in candidates:
        if not email or email in seen:
            continue
        seen.add(email)
        user = users.get_by_email(email)
        if user and user.is_active:
            return user
    # Safety net for custom seeds: берем любого активного пользователя, предпочитая demo-флаг.
    stmt = (
        select(User)
        .where(User.is_active.is_(True))
        .order_by(desc(User.is_demo_user), User.email.asc())
        .limit(1)
    )
    any_active = users.session.execute(stmt).scalar_one_or_none()
    if any_active:
        return any_active
    raise UnauthorizedException("Demo auth bypass enabled, but no active demo user found")


def get_current_active_user(
    users: Annotated[UserRepository, Depends(get_user_repository)],
    authorization: Optional[str] = Header(default=None),
) -> User:
    token: Optional[str] = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()

    if token:
        try:
            payload = decode_access_token(token)
            sub = payload.get("sub")
            if not sub:
                raise UnauthorizedException("Invalid token payload")
            user_id = uuid.UUID(sub)
            user = users.get_by_id(user_id)
            if not user:
                raise UnauthorizedException("User not found")
            if not user.is_active:
                raise UnauthorizedException("Account is disabled")
            return user
        except Exception:
            # В демо-режиме даём мягкий fallback, чтобы UI работал без логина.
            if not _demo_auth_enabled():
                raise

    if _demo_auth_enabled():
        return _resolve_demo_user(users)
    raise UnauthorizedException("Missing or invalid Authorization header")


def require_capability(action: str) -> Callable[..., User]:
    """Проверка по матрице `role_policy` (не путать с грубым require_roles)."""

    def _dependency(user: Annotated[User, Depends(get_current_active_user)]) -> User:
        rk = user.role.role_key if user.role else None
        assert_role_capability(rk, action)
        return user

    return _dependency


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
