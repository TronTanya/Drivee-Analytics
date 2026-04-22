from __future__ import annotations

from typing import Optional


class AppException(Exception):
    """Base application exception with status metadata."""

    status_code = 500
    error_code = "internal_error"

    def __init__(self, message: str, *, details: Optional[dict] = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFoundException(AppException):
    status_code = 404
    error_code = "not_found"


class UnauthorizedException(AppException):
    status_code = 401
    error_code = "unauthorized"


class ForbiddenException(AppException):
    status_code = 403
    error_code = "forbidden"


class ValidationException(AppException):
    status_code = 422
    error_code = "validation_error"


class ConflictException(AppException):
    status_code = 409
    error_code = "conflict"
