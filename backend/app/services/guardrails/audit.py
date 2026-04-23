"""Структурированный аудит NL→SQL (без PII в логах — только id и ключи)."""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

_audit = logging.getLogger("audit.query")


def log_query_audit_event(
    *,
    event: str,
    user_id: Optional[str],
    role_key: Optional[str],
    workspace_id: Optional[str],
    prompt_excerpt: str,
    intent: Optional[str],
    canonical_metric: Optional[str],
    generated_sql_excerpt: str,
    validation_ok: Optional[bool],
    validation_errors: Optional[list[str]],
    execution_status: Optional[str],
    warnings: Optional[list[str]],
    blocked_reason: Optional[str] = None,
    extra: Optional[dict[str, Any]] = None,
) -> None:
    payload = {
        "event": event,
        "user_id": user_id,
        "role_key": role_key,
        "workspace_id": workspace_id,
        "prompt_prefix": (prompt_excerpt or "")[:500],
        "intent": intent,
        "canonical_metric": canonical_metric,
        "sql_prefix": (generated_sql_excerpt or "")[:800],
        "validation_ok": validation_ok,
        "validation_errors": list(validation_errors or [])[:20],
        "execution_status": execution_status,
        "warnings": list(warnings or [])[:30],
        "blocked_reason": blocked_reason,
        **(extra or {}),
    }
    _audit.info("%s", json.dumps(payload, ensure_ascii=False, default=str))
