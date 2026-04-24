from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.auth.constants import RoleKey


def _normalize_auth_email(value: str) -> str:
    """EmailStr отсекает *.local (reserved); демо-аккаунты используют @drivee.local."""
    email = (value or "").strip().lower()
    if len(email) < 5 or "@" not in email or email.count("@") != 1:
        raise ValueError("Укажите корректный email")
    local, _, domain = email.partition("@")
    if not local or not domain:
        raise ValueError("Укажите корректный email")
    if len(email) > 254:
        raise ValueError("Слишком длинный email")
    return email


class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str = Field(..., min_length=8, max_length=128)
    role: RoleKey
    is_demo: bool = Field(
        default=False,
        description="Mark account as demo (demo-mode registration with chosen role).",
    )

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _normalize_auth_email(v)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=254)
    password: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _normalize_auth_email(v)


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Access token lifetime in seconds")
    role: RoleKey


class UserProfileMeResponse(BaseModel):
    """Публичные поля профиля + клиентские настройки из profile_json."""

    first_name: str | None = None
    last_name: str | None = None
    timezone: str = "UTC"
    locale: str = "ru"
    default_report_pdf_mode: Literal["compact", "board"] = "board"


class UserProfilePatchRequest(BaseModel):
    first_name: str | None = Field(default=None, max_length=128)
    last_name: str | None = Field(default=None, max_length=128)
    timezone: str | None = Field(default=None, max_length=64)
    locale: str | None = Field(default=None, max_length=16)
    default_report_pdf_mode: Literal["compact", "board"] | None = None


class UserMeResponse(BaseModel):
    id: UUID
    # Для demo-аккаунтов поддерживаем адреса вида *.local (pydantic EmailStr их отсекает как reserved).
    email: str
    role: RoleKey
    is_active: bool
    is_demo_user: bool
    default_workspace_id: UUID | None = Field(
        default=None,
        description="Первый workspace пользователя (membership с is_default или любой доступный).",
    )
    profile: UserProfileMeResponse

    model_config = {"from_attributes": True}
