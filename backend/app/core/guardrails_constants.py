"""Политики guardrails: метрики по ролям (канонические ключи = semantic dictionary)."""

from __future__ import annotations

from typing import Dict, FrozenSet, Optional

# Канонические метрики, разрешённые роли (None = без ограничения сверх SQL-слоя).
ROLE_ALLOWED_CANONICAL_METRICS: Dict[str, Optional[FrozenSet[str]]] = {
    "admin": None,
    "manager": None,
    "marketer": None,
    # Executive: без «сырой» выручки/цен и идентификаторов в метриках; только агрегаты операций.
    "executive": frozenset(
        {
            "orders_count",
            "train_row_count",
            "distinct_orders",
            "tenders_count",
            "done_rides",
            "cancellations_total",
            "client_cancellations",
            "driver_cancellations",
            "cancellation_rate",
            "done_conversion",
            "cancel_before_accept_count",
            "avg_duration_seconds",
            "avg_distance_meters",
            "time_to_accept_seconds",
            "time_to_arrive_seconds",
        }
    ),
}

# Колонки, которые нельзя светить роли без привилегий (PII-подобные).
SQL_SENSITIVE_COLUMNS: FrozenSet[str] = frozenset({"user_id", "driver_id"})

# Роли, которым разрешены чувствительные колонки в SELECT/WHERE.
ROLES_SENSITIVE_COLUMNS_OK: FrozenSet[str] = frozenset({"admin", "manager"})
