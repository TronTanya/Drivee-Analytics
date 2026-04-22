from __future__ import annotations

import uuid

from app.auth.constants import ALLOWED_ROLE_KEYS
from app.core.config import settings
from app.core.exceptions import ConflictException, UnauthorizedException, ValidationException
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.repositories.role_repository import RoleRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import RegisterRequest, TokenPairResponse


class AuthService:
    def __init__(self, user_repository: UserRepository, role_repository: RoleRepository) -> None:
        self._users = user_repository
        self._roles = role_repository

    def _issue_tokens(self, user: User) -> TokenPairResponse:
        role_key = user.role.role_key
        if role_key not in ALLOWED_ROLE_KEYS:
            role_key = "manager"
        access = create_access_token(user_id=user.id, role_key=role_key)
        refresh = create_refresh_token(user_id=user.id)
        return TokenPairResponse(
            access_token=access,
            refresh_token=refresh,
            expires_in=settings.access_token_exp_minutes * 60,
            role=role_key,  # type: ignore[arg-type]
        )

    def register(self, payload: RegisterRequest) -> TokenPairResponse:
        role = self._roles.get_by_key(payload.role)
        if not role:
            raise ValidationException("Role is not configured in the database")

        if self._users.get_by_email(str(payload.email).lower()):
            raise ConflictException("User with this email already exists")

        user = User(
            email=str(payload.email).lower(),
            password_hash=hash_password(payload.password),
            role_id=role.id,
            is_demo_user=payload.is_demo,
            is_active=True,
        )
        self._users.create(user)
        self._users.session.commit()
        self._users.session.refresh(user)
        return self._issue_tokens(user)

    def login(self, email: str, password: str) -> TokenPairResponse:
        user = self._users.get_by_email(email.lower())
        if not user or not verify_password(password, user.password_hash):
            raise UnauthorizedException("Invalid email or password")
        if not user.is_active:
            raise UnauthorizedException("Account is disabled")

        self._users.update_last_login(user)
        self._users.session.commit()
        self._users.session.refresh(user)
        return self._issue_tokens(user)

    def refresh(self, refresh_token: str) -> TokenPairResponse:
        payload = decode_refresh_token(refresh_token)
        sub = payload.get("sub")
        if not sub:
            raise UnauthorizedException("Invalid refresh payload")
        try:
            user_id = uuid.UUID(sub)
        except ValueError as exc:
            raise UnauthorizedException("Invalid subject in refresh token") from exc

        user = self._users.get_by_id(user_id)
        if not user or not user.is_active:
            raise UnauthorizedException("User not found or inactive")

        return self._issue_tokens(user)
