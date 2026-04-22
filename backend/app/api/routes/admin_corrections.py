"""Admin-only CRUD for learned query corrections (correction mode)."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.dependencies import require_roles
from app.core.exceptions import NotFoundException
from app.models.user import User
from app.repositories.query_correction_repository import QueryCorrectionRepository
from app.schemas.correction import QueryCorrectionCreate, QueryCorrectionResponse
from app.services.correction_learning_service import CorrectionLearningService

router = APIRouter(prefix="/admin/corrections", tags=["admin-corrections"])


@router.post("", response_model=QueryCorrectionResponse)
def create_correction(
    body: QueryCorrectionCreate,
    user: User = Depends(require_roles("admin")),
    session: Session = Depends(get_db_session),
) -> QueryCorrectionResponse:
    repo = QueryCorrectionRepository(session)
    svc = CorrectionLearningService(repo)
    row = svc.persist_correction(
        workspace_id=body.workspace_id,
        original_query=body.original_query,
        generated_sql=body.generated_sql,
        corrected_sql=body.corrected_sql,
        correction_type=body.correction_type,
        semantic_terms_before=body.semantic_terms_before,
        semantic_terms_after=body.semantic_terms_after,
        created_by=user.id,
        notes=body.notes,
    )
    session.commit()
    session.refresh(row)
    return QueryCorrectionResponse.model_validate(row)


@router.get("", response_model=list[QueryCorrectionResponse])
def list_corrections(
    workspace_id: uuid.UUID = Query(..., description="Workspace whose correction library to list"),
    _: User = Depends(require_roles("admin")),
    session: Session = Depends(get_db_session),
) -> list[QueryCorrectionResponse]:
    repo = QueryCorrectionRepository(session)
    rows = repo.list_for_workspace(workspace_id)
    return [QueryCorrectionResponse.model_validate(r) for r in rows]


@router.get("/{correction_id}", response_model=QueryCorrectionResponse)
def get_correction(
    correction_id: uuid.UUID,
    _: User = Depends(require_roles("admin")),
    session: Session = Depends(get_db_session),
) -> QueryCorrectionResponse:
    repo = QueryCorrectionRepository(session)
    row = repo.get(correction_id)
    if not row:
        raise NotFoundException("Correction not found")
    return QueryCorrectionResponse.model_validate(row)
