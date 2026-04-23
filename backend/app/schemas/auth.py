from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.auth.constants import RoleKey


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: RoleKey
    is_demo: bool = Field(
        default=False,
        description="Mark account as demo (demo-mode registration with chosen role).",
    )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPairResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Access token lifetime in seconds")
    role: RoleKey


class UserMeResponse(BaseModel):
    id: UUID
    email: EmailStr
    role: RoleKey
    is_active: bool
    is_demo_user: bool
    default_workspace_id: UUID | None = Field(
        default=None,
        description="Первый workspace пользователя (membership с is_default или любой доступный).",
    )

    model_config = {"from_attributes": True}
