from fastapi import APIRouter

from app.api.routes.admin_corrections import router as admin_corrections_router
from app.api.routes.admin_sql_policy import router as admin_sql_policy_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.auth import router as auth_router
from app.api.routes.dashboards import router as dashboards_router
from app.api.routes.data_layer import data_router, forecast_router
from app.api.routes.dictionary import router as dictionary_router
from app.api.routes.evaluation_nl_sql import router as evaluation_nl_sql_router
from app.api.routes.evaluation_drivee_quality import router as evaluation_drivee_quality_router
from app.api.routes.evaluation_sql_correctness import router as evaluation_sql_correctness_router
from app.api.routes.history import router as history_router
from app.api.routes.health import router as health_router
from app.api.routes.meta import router as meta_router
from app.api.routes.templates_api import router as templates_api_router
from app.api.routes.notebooks import router as notebooks_router
from app.api.routes.reports import router as reports_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(notebooks_router)
api_router.include_router(dashboards_router)
api_router.include_router(analytics_router)
api_router.include_router(data_router)
api_router.include_router(forecast_router)
api_router.include_router(meta_router)
api_router.include_router(dictionary_router)
api_router.include_router(admin_corrections_router)
api_router.include_router(admin_sql_policy_router)
api_router.include_router(reports_router)
api_router.include_router(templates_api_router)
api_router.include_router(history_router)
api_router.include_router(evaluation_nl_sql_router)
api_router.include_router(evaluation_sql_correctness_router)
api_router.include_router(evaluation_drivee_quality_router)
