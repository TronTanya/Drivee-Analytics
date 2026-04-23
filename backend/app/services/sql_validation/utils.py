"""Lightweight SQL helpers for guardrails (regex/heuristic — not a full parser)."""

from __future__ import annotations

import re
from typing import Dict, List, Optional, Set, Tuple

from app.core.sql_validation_constants import ALIAS_STOPWORDS

_WS_RE = re.compile(r"\s+")

# FROM [schema.]table [alias] | JOIN [schema.]table [alias]
_FROM_JOIN_RE = re.compile(
    r"\b(?:from|join)\s+(?:(?P<schema>[a-z_][a-z0-9_]*)\.)?(?P<table>[a-z_][a-z0-9_]*)(?:\s+(?:as\s+)?(?P<alias>[a-z_][a-z0-9_]*))?",
    re.IGNORECASE,
)

# qualified column: alias.col (avoid numeric left part)
_QUALIFIED_COL_RE = re.compile(r"\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b", re.IGNORECASE)

_LIMIT_RE = re.compile(r"\blimit\s+(\d+)\b", re.IGNORECASE)

# WITH name AS ( ... ), name2 AS ( ... )
_CTE_NAMES_RE = re.compile(r"(?:\bwith\b|,)\s*([a-z_][a-z0-9_]*)\s+as\b", re.IGNORECASE)


def collapse_whitespace(sql: str) -> str:
    return _WS_RE.sub(" ", sql.strip())


def normalize_for_checks(sql: str) -> str:
    return collapse_whitespace(sql).lower()


def pad_tokens(sql_lower: str) -> str:
    return f" {sql_lower} "


def split_statements(sql: str) -> List[str]:
    return [s.strip() for s in sql.split(";") if s.strip()]


def extract_cte_names(sql_lower: str) -> Set[str]:
    return {m.group(1).lower() for m in _CTE_NAMES_RE.finditer(sql_lower)}


def _skip_join_table_token(table: str) -> bool:
    return table.lower() in {"select", "with", "lateral", "unnest", "values"}


def extract_from_join_qualified(sql_lower: str, implicit_schema: str) -> list[tuple[str, str]]:
    """Возвращает пары (schema, table) для каждого физического FROM/JOIN (без CTE — фильтруйте снаружи)."""
    implicit = (implicit_schema or "public").strip().lower() or "public"
    out: list[tuple[str, str]] = []
    for m in _FROM_JOIN_RE.finditer(sql_lower):
        t = str(m.group("table")).lower()
        if _skip_join_table_token(t):
            continue
        sch_raw = m.group("schema")
        sch = str(sch_raw).lower() if sch_raw else implicit
        out.append((sch, t))
    return out


def extract_from_join_tables(sql_lower: str, implicit_schema: str = "public") -> Set[str]:
    """Имена таблиц без схемы (для обратной совместимости с проверками whitelist по basename)."""
    return {t for _, t in extract_from_join_qualified(sql_lower, implicit_schema)}


def build_alias_to_table_map(sql_lower: str) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    for m in _FROM_JOIN_RE.finditer(sql_lower):
        table = str(m.group("table")).lower()
        if _skip_join_table_token(table):
            continue
        alias_raw = m.group("alias")
        if alias_raw:
            alias = str(alias_raw).lower()
            if alias in ALIAS_STOPWORDS:
                mapping[table] = table
            else:
                mapping[alias] = table
        else:
            mapping[table] = table
    return mapping


def extract_qualified_columns(sql_lower: str) -> List[Tuple[str, str]]:
    return [(a.lower(), c.lower()) for a, c in _QUALIFIED_COL_RE.findall(sql_lower)]


def parse_limit_value(sql_lower: str) -> Tuple[Optional[int], Optional[str]]:
    """Returns (limit_int or None, full match substring or None) for last LIMIT clause heuristic."""
    matches = list(_LIMIT_RE.finditer(sql_lower))
    if not matches:
        return None, None
    last = matches[-1]
    return int(last.group(1)), last.group(0)


def apply_default_limit(sql_for_execution: str, default_limit: int) -> str:
    """Append LIMIT if missing (sql_for_execution is single-statement, trimmed)."""
    lowered = sql_for_execution.lower()
    if " limit " in pad_tokens(lowered):
        return sql_for_execution
    sep = "" if sql_for_execution.rstrip().endswith(";") else ""
    trimmed = sql_for_execution.rstrip().rstrip(";")
    return f"{trimmed} LIMIT {default_limit}{sep}"


def clamp_limit_clause(sql: str, sql_lower: str, max_limit: int) -> Tuple[str, bool]:
    """
    If LIMIT exceeds max_limit, replace the last LIMIT N with LIMIT max_limit.
    Returns (possibly_modified_sql, was_clamped).
    """
    matches = list(_LIMIT_RE.finditer(sql_lower))
    if not matches:
        return sql, False
    last = matches[-1]
    n = int(last.group(1))
    if n <= max_limit:
        return sql, False
    start, end = last.span()
    # apply slice on original `sql` using same span — lengths differ if case differs; use lower span on lower string
    # safer: rebuild from sql_lower replacement then we'd lose case — replace in sql via span from parallel indices
    orig_lower = sql.lower()
    ostart = orig_lower.rfind(last.group(0))
    if ostart < 0:
        return sql, False
    oend = ostart + len(last.group(0))
    new_clause = f"limit {max_limit}"
    patched = sql[:ostart] + new_clause + sql[oend:]
    return patched, True
