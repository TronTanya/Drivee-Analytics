"""Static rules for SQL guardrails (tables/columns by role, blocked statements)."""

from __future__ import annotations

from typing import Dict, FrozenSet, Optional

# Whole-word blocked inside padded SQL (lowercase).
BLOCKED_SQL_VERBS: FrozenSet[str] = frozenset(
    {
        "insert",
        "update",
        "delete",
        "drop",
        "alter",
        "truncate",
        "create",
    }
)

# Aliases / keywords that must not be consumed as a table alias after FROM table
ALIAS_STOPWORDS: FrozenSet[str] = frozenset(
    {
        "where",
        "on",
        "group",
        "order",
        "limit",
        "having",
        "as",
        "left",
        "right",
        "inner",
        "outer",
        "cross",
        "join",
        "using",
        "natural",
        "union",
        "intersect",
        "except",
    }
)

SQL_KEYWORDS: FrozenSet[str] = frozenset(
    {
        "select",
        "from",
        "where",
        "and",
        "or",
        "not",
        "null",
        "true",
        "false",
        "case",
        "when",
        "then",
        "else",
        "end",
        "as",
        "on",
        "join",
        "left",
        "right",
        "inner",
        "outer",
        "cross",
        "group",
        "by",
        "order",
        "limit",
        "offset",
        "having",
        "union",
        "all",
        "with",
        "distinct",
        "between",
        "in",
        "like",
        "ilike",
        "exists",
        "some",
        "any",
        "over",
        "partition",
        "rows",
        "range",
        "current_date",
        "current_timestamp",
        "interval",
        "date_trunc",
        "coalesce",
        "nullif",
        "sum",
        "count",
        "avg",
        "min",
        "max",
        "filter",
        "cast",
        "boolean",
        "int",
        "bigint",
        "numeric",
        "float",
        "double",
        "text",
        "uuid",
    }
)

# role_key -> optional table subset (None = all tables allowed by global whitelist)
ROLE_TABLE_ALLOWLIST: Dict[str, Optional[FrozenSet[str]]] = {
    "admin": None,
    "manager": None,
    "marketer": None,
    "executive": frozenset({"anonymized_incity_orders"}),
}

# role_key -> table -> allowed columns (None = no extra column restriction for this role)
ROLE_COLUMN_ALLOWLIST: Dict[str, Optional[Dict[str, FrozenSet[str]]]] = {
    "admin": None,
    "manager": None,
    "marketer": None,
    "executive": {
        "anonymized_incity_orders": frozenset(
            {
                "city_id",
                "offset_hours",
                "order_id",
                "tender_id",
                "user_id",
                "driver_id",
                "status_order",
                "status_tender",
                "order_timestamp",
                "tender_timestamp",
                "driveraccept_timestamp",
                "driverarrived_timestamp",
                "driverstarttheride_timestamp",
                "driverdone_timestamp",
                "clientcancel_timestamp",
                "drivercancel_timestamp",
                "order_modified_local",
                "cancel_before_accept_local",
                "distance_in_meters",
                "duration_in_seconds",
                "price_order_local",
                "price_tender_local",
                "price_start_local",
            }
        ),
    },
}

DEFAULT_ROLE_FALLBACK: str = "manager"
