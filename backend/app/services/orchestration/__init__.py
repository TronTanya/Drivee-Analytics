__all__ = ["QueryOrchestrator", "build_default_orchestrator", "build_orchestrator_with_learning"]


def __getattr__(name: str):
    if name == "QueryOrchestrator":
        from app.services.orchestration.query_orchestrator import QueryOrchestrator

        return QueryOrchestrator
    if name == "build_default_orchestrator":
        from app.services.orchestration.query_orchestrator import build_default_orchestrator

        return build_default_orchestrator
    if name == "build_orchestrator_with_learning":
        from app.services.orchestration.query_orchestrator import build_orchestrator_with_learning

        return build_orchestrator_with_learning
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
