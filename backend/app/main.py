import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

logger = logging.getLogger(__name__)

from app.api.router import api_router
from app.core.config import settings
from app.core.error_handlers import register_error_handlers
from app.core.logging import configure_logging
from app.db.session import engine
from app.schemas.health import HealthResponse, RuntimeHealthResponse
from app.services.llm.factory import build_provider, log_llm_startup_summary


def create_app() -> FastAPI:
    configure_logging()
    log_llm_startup_summary()
    env = (settings.app_env or "").strip().lower()
    if env in ("prod", "production"):
        if settings.debug:
            logger.warning("APP_ENV=prod при DEBUG=true — отключите debug в production.")
    else:
        if not (settings.jwt_secret or "").strip():
            logger.warning(
                "JWT_SECRET пустой (%s): токены подписываются dev-fallback (см. app.core.security).",
                settings.app_env,
            )
    app = FastAPI(title=settings.app_name, version=settings.app_version, debug=settings.debug)

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

    @app.get("/health/runtime", response_model=RuntimeHealthResponse, tags=["health"])
    def runtime_health() -> RuntimeHealthResponse:
        llm_provider = (settings.llm_provider or "").strip()
        llm_configured = build_provider() is not None
        env_runtime = (settings.app_env or "").strip().lower()
        postgres_required = (not settings.mock_mode) and (not settings.mock_sql_execution_fallback)
        return RuntimeHealthResponse(
            environment=settings.app_env,
            debug=bool(settings.debug),
            demo_auth_bypass_enabled=bool(settings.demo_auth_bypass_enabled),
            mock_mode=bool(settings.mock_mode),
            mock_sql_execution_fallback=bool(settings.mock_sql_execution_fallback),
            postgres_required=postgres_required,
            jwt_required=env_runtime in ("prod", "production"),
            llm_provider=llm_provider,
            llm_configured=llm_configured,
        )

    cors_origins = list(settings.cors_origins)
    _localhost_dev_origins = {"http://localhost:3000", "http://localhost:3001"}
    if env in ("demo", "production", "prod") and cors_origins and set(cors_origins) <= _localhost_dev_origins:
        logger.warning(
            "CORS только localhost для app_env=%s — задайте CORS_ORIGINS под реальные фронт-хосты.",
            settings.app_env,
        )

    # В dev: явные origin + regex на любой порт localhost/127.0.0.1 (3001, 5173, …).
    # В prod — только список CORS_ORIGINS из окружения.
    if env not in ("prod", "production"):
        dev_defaults = [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ]
        cors_origins = list(dict.fromkeys([*(o for o in cors_origins if o and str(o).strip()), *dev_defaults]))

    _cors_kw: dict = {
        "allow_origins": cors_origins,
        "allow_credentials": True,
        "allow_methods": ["*"],
        "allow_headers": ["*"],
    }
    if env not in ("prod", "production"):
        _cors_kw["allow_origin_regex"] = r"https?://(localhost|127\.0\.0\.1)(:\d+)?$"
    # Последним в стеке = внешний слой: корректные заголовки на OPTIONS и на ответы с ошибками.
    app.add_middleware(CORSMiddleware, **_cors_kw)

    return app


app = create_app()
