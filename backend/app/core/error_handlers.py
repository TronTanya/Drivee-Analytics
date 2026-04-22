from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.core.exceptions import AppException
from app.schemas.common import ErrorResponse


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def app_exception_handler(_: Request, exc: AppException) -> JSONResponse:
        payload = ErrorResponse(error=exc.error_code, message=exc.message, details=exc.details)
        return JSONResponse(status_code=exc.status_code, content=payload.model_dump())

    @app.exception_handler(ValidationError)
    async def validation_exception_handler(_: Request, exc: ValidationError) -> JSONResponse:
        payload = ErrorResponse(error="validation_error", message="Validation failed", details={"errors": exc.errors()})
        return JSONResponse(status_code=422, content=payload.model_dump())

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        payload = ErrorResponse(error="internal_error", message="Unexpected server error", details={"exception": type(exc).__name__})
        return JSONResponse(status_code=500, content=payload.model_dump())
