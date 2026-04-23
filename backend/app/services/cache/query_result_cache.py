"""Кэш результатов выполнения типовых SQL (ключ: workspace + роль + нормализованный SQL)."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Optional

from app.core.config import settings
from app.services.cache.ttl_cache import TTLCache

_cache_store: Optional[TTLCache[CachedSqlResult]] = None


@dataclass(frozen=True)
class CachedSqlResult:
    rows: list[dict[str, Any]]
    columns: list[str]
    rowcount: int
    final_sql: str


def _cache_enabled() -> bool:
    return bool(getattr(settings, "sql_result_cache_enabled", True))


def _cache() -> TTLCache[CachedSqlResult]:
    global _cache_store
    if _cache_store is None:
        _cache_store = TTLCache[CachedSqlResult](
            maxsize=int(getattr(settings, "sql_result_cache_max_entries", 200)),
            ttl_seconds=float(getattr(settings, "sql_result_cache_ttl_seconds", 60)),
        )
    return _cache_store


def make_nl_sql_cache_key(
    *,
    workspace_id: Optional[str],
    user_id: Optional[str],
    role_key: Optional[str],
    final_sql: str,
) -> str:
    payload = {
        "w": workspace_id or "",
        "u": user_id or "",
        "r": (role_key or "").lower(),
        "q": (final_sql or "").strip().lower(),
    }
    raw = json.dumps(payload, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def try_get_cached_sql_result(key: str) -> Optional[CachedSqlResult]:
    if not _cache_enabled():
        return None
    return _cache().get(key)


def store_cached_sql_result(key: str, value: CachedSqlResult) -> None:
    if not _cache_enabled():
        return
    max_rows = int(getattr(settings, "sql_result_cache_max_rowcount", 800))
    if value.rowcount > max_rows:
        return
    _cache().set(key, value)
