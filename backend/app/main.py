from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.core.error_handlers import register_error_handlers
from app.core.logging import configure_logging
from app.db.session import engine
from app.schemas.health import HealthResponse


def create_app() -> FastAPI:
    configure_logging()
    app = FastAPI(title=settings.app_name, version=settings.app_version, debug=settings.debug)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/health", response_model=HealthResponse, tags=["health"])
    def root_health() -> HealthResponse:
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

    return app


app = create_app()
