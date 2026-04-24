from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.schemas.health import HealthResponse
from app.services.llm.factory import build_provider

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse)
def health_check() -> HealthResponse:
    db_status = "down"
    status = "degraded"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "up"
        status = "ok"
    except Exception:  # noqa: BLE001
        db_status = "down"

    llm_provider = (settings.llm_provider or "").strip()
    llm_configured = build_provider() is not None

    return HealthResponse(
        status=status,
        service=settings.app_name,
        environment=settings.app_env,
        database=db_status,
        llm_provider=llm_provider,
        llm_configured=llm_configured,
    )
