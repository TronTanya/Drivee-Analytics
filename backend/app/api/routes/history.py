from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_db_session
from app.models.user import User
from app.schemas.reporting import HistoryItemResponse
from app.services.query_history_service import list_query_history
from app.services.report_service import _require_workspace

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=list[HistoryItemResponse])
def get_query_history(
    workspace_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=500),
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> list[HistoryItemResponse]:
    _require_workspace(session, user.id, workspace_id)
    return list_query_history(session, workspace_id=workspace_id, user_id=user.id, limit=limit)
