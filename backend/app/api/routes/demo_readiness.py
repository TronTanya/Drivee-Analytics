"""Публичный чеклист готовности демо (киоск / Quality Center без отдельной роли)."""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas.demo_readiness import DemoReadinessResponse
from app.services.demo_readiness_service import build_demo_readiness_response

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/readiness", response_model=DemoReadinessResponse)
def demo_readiness() -> DemoReadinessResponse:
    """Проверка backend, БД, semantic layer, guardrails, отчёты/расписания, eval-артефакты, демо-пользователи."""
    return build_demo_readiness_response()
