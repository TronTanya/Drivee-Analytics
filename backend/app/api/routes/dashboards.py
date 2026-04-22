from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db_session, get_current_active_user
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.user import User
from app.repositories.dashboard_repository import DashboardRepository
from app.repositories.notebook_repository import NotebookRepository
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.dashboard import (
    CreateAutoDashboardRequest,
    DashboardDetailResponse,
    DashboardSuggestionResponse,
)
from app.services.auto_dashboard_suggestion_service import build_suggestion_from_history

router = APIRouter(prefix="/workspaces/{workspace_id}/dashboards", tags=["dashboards"])


def _require_workspace(session: Session, user_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
    if not WorkspaceRepository(session).user_has_workspace_access(user_id, workspace_id):
        raise ForbiddenException("No access to this workspace")


@router.get("/suggest", response_model=DashboardSuggestionResponse)
def suggest_auto_dashboard(
    workspace_id: uuid.UUID,
    days_back: int = Query(90, ge=1, le=365),
    limit: int = Query(200, ge=5, le=500),
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> DashboardSuggestionResponse:
    _require_workspace(session, user.id, workspace_id)
    history = NotebookRepository(session).list_prompt_execution_history(
        workspace_id,
        user.id,
        limit=limit,
        days_back=days_back,
    )
    return build_suggestion_from_history(history)


@router.post("", response_model=DashboardDetailResponse)
def create_dashboard(
    workspace_id: uuid.UUID,
    body: CreateAutoDashboardRequest,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> DashboardDetailResponse:
    _require_workspace(session, user.id, workspace_id)
    dash_repo = DashboardRepository(session)
    widgets_payload = [
        {
            "title": w.title,
            "chart_type": w.chart_type,
            "metric_key": w.metric_key,
            "width": w.width,
            "height": w.height,
            "config_json": w.config_json,
        }
        for w in body.widgets
    ]
    dash = dash_repo.create_auto_dashboard_with_widgets(
        workspace_id=workspace_id,
        owner_user_id=user.id,
        title=body.title,
        description=body.description,
        widgets=widgets_payload,
        source_history_window_json={"origin": "api_create_auto", "widget_count": len(widgets_payload)},
    )
    session.commit()
    loaded = dash_repo.get_with_widgets(dash.id)
    if not loaded:
        raise NotFoundException("Dashboard not found after create")
    return DashboardDetailResponse.model_validate(loaded)
