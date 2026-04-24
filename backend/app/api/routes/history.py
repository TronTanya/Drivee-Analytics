from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_db_session
from app.auth.constants import RoleKey
from app.models.user import User
from app.schemas.reporting import HistoryItemResponse
from app.services.query_history_service import list_query_history
from app.services.report_service import _require_workspace

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=list[HistoryItemResponse])
def get_query_history(
    workspace_id: uuid.UUID,
    limit: int = Query(100, ge=1, le=500),
    q: str | None = Query(None, description="Поиск по тексту промпта"),
    date_from: datetime | None = Query(None, description="UTC: нижняя граница updated_at ячейки"),
    date_to: datetime | None = Query(None, description="UTC: верхняя граница updated_at ячейки"),
    query_type: str | None = Query(
        None,
        description="trips_by_city | cancellations | conversion | avg_check | orders_trend | all",
    ),
    owner_user_id: uuid.UUID | None = Query(None, description="Фильтр по владельцу ноутбука (только admin)"),
    scope: str = Query(
        "mine",
        description="mine — только мои ноутбуки; workspace — все сценарии workspace (участник workspace)",
    ),
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> list[HistoryItemResponse]:
    _require_workspace(session, user.id, workspace_id)
    role_key: RoleKey | None = user.role.role_key if user.role else None  # type: ignore[assignment]
    is_admin = role_key == "admin"
    eff_scope = scope if scope in ("mine", "workspace") else "mine"
    eff_owner = owner_user_id
    if eff_owner is not None and eff_owner != user.id and not is_admin:
        eff_owner = None
    return list_query_history(
        session,
        workspace_id=workspace_id,
        user_id=user.id,
        limit=limit,
        q=q,
        date_from=date_from,
        date_to=date_to,
        query_type=query_type,
        owner_user_id=eff_owner,
        scope=eff_scope,
    )
