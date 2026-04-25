"""Админ: дополнительные whitelist-таблицы/колонки и лимит строк для NL→SQL."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db_session
from app.auth.dependencies import require_roles
from app.core.config import settings
from app.core.exceptions import ValidationException
from app.models.platform_sql_policy import PlatformSqlPolicy
from app.models.user import User
from app.repositories.platform_sql_policy_repository import PlatformSqlPolicyRepository
from app.schemas.admin_sql_policy import AdminSqlPolicyResponse, AdminSqlPolicyUpdate
from app.db.session import SessionLocal
from app.services.sql_validation.effective_sql_settings import (
    get_effective_sql_settings,
    invalidate_effective_sql_settings_cache,
)

router = APIRouter(prefix="/admin/sql-policy", tags=["admin"])


def _read_extras_from_db() -> tuple[list[str], list[str], int | None]:
    try:
        with SessionLocal() as s:
            row = s.get(PlatformSqlPolicy, 1)
            if not row:
                return [], [], None
            return (
                list(row.extra_whitelist_tables or []),
                list(row.extra_whitelist_columns or []),
                int(row.nl_max_result_rows) if row.nl_max_result_rows is not None else None,
            )
    except Exception:
        return [], [], None


def _build_response() -> AdminSqlPolicyResponse:
    eff = get_effective_sql_settings()
    extra_t, extra_c, cap = _read_extras_from_db()
    return AdminSqlPolicyResponse(
        extra_whitelist_tables=extra_t,
        extra_whitelist_columns=extra_c,
        nl_max_result_rows=cap,
        effective_whitelist_tables=list(eff.sql_whitelist_tables),
        effective_whitelist_columns=list(eff.sql_whitelist_columns),
        effective_sql_default_limit=int(eff.sql_default_limit),
    )


@router.get("", response_model=AdminSqlPolicyResponse)
def get_sql_policy(
    _: User = Depends(require_roles("admin")),
) -> AdminSqlPolicyResponse:
    return _build_response()


@router.put("", response_model=AdminSqlPolicyResponse)
def put_sql_policy(
    body: AdminSqlPolicyUpdate,
    _: User = Depends(require_roles("admin")),
    session: Session = Depends(get_db_session),
) -> AdminSqlPolicyResponse:
    hard = int(getattr(settings, "sql_execution_hard_row_cap", 1_000_000) or 1_000_000)
    base_lim = int(settings.sql_default_limit)
    cap = body.nl_max_result_rows
    if cap is not None:
        if cap < 1 or cap > min(base_lim, hard):
            raise ValidationException(
                f"nl_max_result_rows должен быть 1..{min(base_lim, hard)} (текущие лимиты сервера)."
            )
    repo = PlatformSqlPolicyRepository(session)
    repo.update_singleton(
        extra_tables=list(body.extra_whitelist_tables),
        extra_columns=list(body.extra_whitelist_columns),
        nl_max_result_rows=cap,
    )
    invalidate_effective_sql_settings_cache()
    return _build_response()
