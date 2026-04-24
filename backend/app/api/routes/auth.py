from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_active_user
from app.api.deps import get_auth_service, get_db_session
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPairResponse,
    UserMeResponse,
    UserProfilePatchRequest,
)
from app.services.auth_service import AuthService
from app.services.user_profile_serialization import apply_profile_patch, profile_me_response

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_me_response(user: User, session: Session) -> UserMeResponse:
    ws = WorkspaceRepository(session).get_default_workspace_id_for_user(user.id)
    return UserMeResponse(
        id=user.id,
        email=user.email,
        role=user.role.role_key,  # type: ignore[arg-type]
        is_active=user.is_active,
        is_demo_user=user.is_demo_user,
        default_workspace_id=ws,
        profile=profile_me_response(user),
    )


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
    return _user_me_response(current_user, session)


@router.patch("/me/profile", response_model=UserMeResponse)
def patch_me_profile(
    payload: UserProfilePatchRequest,
    current_user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> UserMeResponse:
    users = UserRepository(session)
    apply_profile_patch(session, current_user, payload)
    session.commit()
    fresh = users.get_by_id(current_user.id)
    if not fresh:
        raise HTTPException(status_code=500, detail="User not found after profile update")
    return _user_me_response(fresh, session)
