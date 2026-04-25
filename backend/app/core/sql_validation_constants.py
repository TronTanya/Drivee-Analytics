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
        "merge",
        "replace",
        "grant",
        "revoke",
        "copy",
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
    # Новая политика: без ролевых ограничений по таблицам для аналитических SELECT.
    "executive": None,
}

# role_key -> table -> allowed columns (None = no extra column restriction for this role)
ROLE_COLUMN_ALLOWLIST: Dict[str, Optional[Dict[str, FrozenSet[str]]]] = {
    "admin": None,
    "manager": None,
    "marketer": None,
    # Новая политика: без ролевого column allowlist в SQL validator.
    "executive": None,
}

DEFAULT_ROLE_FALLBACK: str = "manager"
