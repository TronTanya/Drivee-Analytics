from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_db_session
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.user import User
from app.repositories.query_template_repository import QueryTemplateRepository
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.reporting import QueryTemplateResponse, TemplateQuickRunResponse
from app.services.analytics_pipeline import analyze_natural_language

router = APIRouter(prefix="/templates", tags=["templates"])


def _require_workspace(session: Session, user_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
    if not WorkspaceRepository(session).user_has_workspace_access(user_id, workspace_id):
        raise ForbiddenException("No access to this workspace")


@router.get("", response_model=list[QueryTemplateResponse])
def list_templates(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> list[QueryTemplateResponse]:
    _require_workspace(session, user.id, workspace_id)
    if not user.role:
        raise ForbiddenException("User has no role")
    rows = QueryTemplateRepository(session).list_for_workspace_and_role(workspace_id, user.role.id)
    return [QueryTemplateResponse.model_validate(r) for r in rows]


@router.post("/{template_id}/run", response_model=TemplateQuickRunResponse)
def quick_run_template(
    template_id: uuid.UUID,
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> TemplateQuickRunResponse:
    _require_workspace(session, user.id, workspace_id)
    tpl = QueryTemplateRepository(session).get_in_workspace(template_id, workspace_id)
    if not tpl:
        raise NotFoundException("Template not found")
    if user.role and tpl.target_role_id and tpl.target_role_id != user.role.id:
        raise ForbiddenException("This template is not available for your role")
    role_key = user.role.role_key if user.role else None
    result = analyze_natural_language(
        tpl.nl_prompt_template,
        notebook_context=dict(tpl.default_params_json or {}),
        workspace_id=str(workspace_id),
        role_key=role_key,
        db_session=session,
    )
    return TemplateQuickRunResponse(
        template_id=template_id,
        execution_status=result.execution_status,
        safe_sql=result.safe_sql,
        insight=result.insight,
        chart_type=result.chart_type,
        table_records=list(result.table_records),
        confidence=result.confidence,
        warnings=list(result.warnings),
    )
