from fastapi import APIRouter
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.schemas.health import HealthResponse

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
    return HealthResponse(status=status, service=settings.app_name, environment=settings.app_env, database=db_status)
