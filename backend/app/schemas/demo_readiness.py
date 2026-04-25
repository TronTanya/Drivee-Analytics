"""Ответ GET /api/v1/demo/readiness — чеклист готовности демо-контура."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

DemoCheckStatus = Literal["ok", "fail", "warn", "skipped"]
DemoReadinessStatus = Literal["ready", "degraded", "not_ready"]


class DemoReadinessResponse(BaseModel):
    status: DemoReadinessStatus
    checks: dict[str, str] = Field(
        default_factory=dict,
        description="Ключи: backend, database, semantic_dictionary, guardrails, reports, schedules, eval_results, demo_user.",
    )
    score: float = Field(ge=0.0, le=1.0)
