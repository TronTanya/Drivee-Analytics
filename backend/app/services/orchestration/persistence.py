"""Persistence hooks for pipeline step 14 — extend or inject from NotebookService."""

from __future__ import annotations

from typing import Any, Callable, Optional, Protocol

from app.schemas.orchestration import OrchestrationOutput


class OrchestrationPersistenceContext(Protocol):
    """Minimal context adapters may need (session, ids, etc.)."""

    notebook_id: Any
    cell_id: Any
    session: Any


PersistenceCallable = Callable[[OrchestrationOutput, OrchestrationPersistenceContext], None]


class NoOpPersistence:
    def __call__(self, output: OrchestrationOutput, ctx: OrchestrationPersistenceContext) -> None:
        return None


def default_persistence() -> PersistenceCallable:
    return NoOpPersistence()
