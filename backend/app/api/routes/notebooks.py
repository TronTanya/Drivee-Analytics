from __future__ import annotations

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_current_active_user, get_notebook_service
from app.models.user import User
from app.schemas.notebook import (
    NotebookCellCreateRequest,
    NotebookCellResponse,
    NotebookCreateRequest,
    NotebookDetailResponse,
    NotebookListItemResponse,
    NotebookSaveScenarioRequest,
    RerunNotebookResponse,
    RunCellResponse,
    SaveNotebookResponse,
)
from app.services.notebook_service import NotebookService

router = APIRouter(prefix="/notebooks", tags=["notebooks"])


@router.post("", response_model=NotebookDetailResponse)
def create_notebook(
    body: NotebookCreateRequest,
    user: User = Depends(get_current_active_user),
    service: NotebookService = Depends(get_notebook_service),
) -> NotebookDetailResponse:
    return service.create_notebook(user, body)


@router.get("", response_model=list[NotebookListItemResponse])
def list_notebooks(
    workspace_id: Optional[uuid.UUID] = Query(default=None),
    user: User = Depends(get_current_active_user),
    service: NotebookService = Depends(get_notebook_service),
) -> list[NotebookListItemResponse]:
    return service.list_notebooks(user, workspace_id)


@router.get("/{notebook_id}", response_model=NotebookDetailResponse)
def get_notebook(
    notebook_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    service: NotebookService = Depends(get_notebook_service),
) -> NotebookDetailResponse:
    return service.get_notebook(user, notebook_id)


@router.post("/{notebook_id}/cells", response_model=NotebookCellResponse)
def add_cell(
    notebook_id: uuid.UUID,
    body: NotebookCellCreateRequest,
    user: User = Depends(get_current_active_user),
    service: NotebookService = Depends(get_notebook_service),
) -> NotebookCellResponse:
    return service.add_cell(user, notebook_id, body)


@router.post("/{notebook_id}/cells/{cell_id}/run", response_model=RunCellResponse)
def run_cell(
    notebook_id: uuid.UUID,
    cell_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    service: NotebookService = Depends(get_notebook_service),
) -> RunCellResponse:
    return service.run_cell(user, notebook_id, cell_id)


@router.post("/{notebook_id}/rerun", response_model=RerunNotebookResponse)
def rerun_notebook(
    notebook_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    service: NotebookService = Depends(get_notebook_service),
) -> RerunNotebookResponse:
    return service.rerun_notebook(user, notebook_id)


@router.post("/{notebook_id}/save", response_model=SaveNotebookResponse)
def save_notebook_scenario(
    notebook_id: uuid.UUID,
    body: NotebookSaveScenarioRequest,
    user: User = Depends(get_current_active_user),
    service: NotebookService = Depends(get_notebook_service),
) -> SaveNotebookResponse:
    return service.save_as_scenario(user, notebook_id, body)
