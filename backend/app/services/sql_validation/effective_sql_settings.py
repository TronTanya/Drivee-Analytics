"""Слияние env Settings с админской политикой из БД (кэш + инвалидация)."""

from __future__ import annotations

import logging
import re
import threading
import time
from typing import Optional

from app.core.config import Settings, settings
from app.db.session import SessionLocal

logger = logging.getLogger(__name__)

_CACHE_LOCK = threading.Lock()
_CACHE_UNTIL: float = 0.0
_CACHE_VALUE: Optional[Settings] = None
_CACHE_TTL_SEC = 3.0


def invalidate_effective_sql_settings_cache() -> None:
    global _CACHE_UNTIL, _CACHE_VALUE
    with _CACHE_LOCK:
        _CACHE_UNTIL = 0.0
        _CACHE_VALUE = None


def _safe_sql_ident(name: str) -> bool:
    return bool(re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", name.strip().lower()))


def _load_policy_row() -> tuple[list[str], list[str], int | None]:
    try:
        from app.models.platform_sql_policy import PlatformSqlPolicy

        with SessionLocal() as s:
            row = s.get(PlatformSqlPolicy, 1)
            if row is None:
                return [], [], None
            tabs = [str(x).lower() for x in (row.extra_whitelist_tables or []) if _safe_sql_ident(str(x))]
            cols = [str(x).lower() for x in (row.extra_whitelist_columns or []) if _safe_sql_ident(str(x))]
            cap = row.nl_max_result_rows
            return tabs, cols, int(cap) if cap is not None else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("effective_sql_settings_db_read_failed err=%s", exc)
        return [], [], None


def get_effective_sql_settings() -> Settings:
    """Settings для валидации/генерации: базовые whitelist + extras из БД, опционально ужатый LIMIT."""
    global _CACHE_UNTIL, _CACHE_VALUE
    now = time.monotonic()
    with _CACHE_LOCK:
        if _CACHE_VALUE is not None and now < _CACHE_UNTIL:
            return _CACHE_VALUE

    base = settings
    extra_t, extra_c, nl_cap = _load_policy_row()

    merge_tables = list(dict.fromkeys([*(str(t).lower() for t in base.sql_whitelist_tables), *extra_t]))
    merge_cols = list(dict.fromkeys([*(str(c).lower() for c in base.sql_whitelist_columns), *extra_c]))

    hard = int(getattr(base, "sql_execution_hard_row_cap", 5000) or 5000)
    base_lim = int(base.sql_default_limit)
    eff_limit = min(base_lim, hard)
    if nl_cap is not None:
        try:
            eff_limit = max(1, min(int(nl_cap), base_lim, hard))
        except (TypeError, ValueError):
            eff_limit = min(base_lim, hard)

    merged = base.model_copy(
        update={
            "sql_whitelist_tables": merge_tables,
            "sql_whitelist_columns": merge_cols,
            "sql_default_limit": eff_limit,
        }
    )

    with _CACHE_LOCK:
        _CACHE_VALUE = merged
        _CACHE_UNTIL = time.monotonic() + _CACHE_TTL_SEC
        return merged
