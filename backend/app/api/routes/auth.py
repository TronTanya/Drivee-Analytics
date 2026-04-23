from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_active_user
from app.api.deps import get_auth_service, get_db_session
from app.models.user import User
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.auth import LoginRequest, RefreshRequest, RegisterRequest, TokenPairResponse, UserMeResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenPairResponse)
def register(payload: RegisterRequest, auth: AuthService = Depends(get_auth_service)) -> TokenPairResponse:
    return auth.register(payload)


@router.post("/login", response_model=TokenPairResponse)
def login(payload: LoginRequest, auth: AuthService = Depends(get_auth_service)) -> TokenPairResponse:
    return auth.login(str(payload.email), payload.password)


@router.post("/refresh", response_model=TokenPairResponse)
def refresh_tokens(payload: RefreshRequest, auth: AuthService = Depends(get_auth_service)) -> TokenPairResponse:
    return auth.refresh(payload.refresh_token)


@router.get("/me", response_model=UserMeResponse)
def me(
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> UserMeResponse:
    ws = WorkspaceRepository(session).get_default_workspace_id_for_user(current_user.id)
    return UserMeResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role.role_key,  # type: ignore[arg-type]
        is_active=current_user.is_active,
        is_demo_user=current_user.is_demo_user,
        default_workspace_id=ws,
    )
