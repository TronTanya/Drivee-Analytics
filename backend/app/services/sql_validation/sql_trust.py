"""Дополнительные проверки доверия к SQL: опасные конструкции, SELECT *, колонки, превью, объяснение."""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any, Optional

from app.core.guardrails_constants import (
    ROLES_SENSITIVE_COLUMNS_OK,
    SQL_SENSITIVE_COLUMNS,
    SQL_SENSITIVE_COLUMNS_ALWAYS,
)
from app.services.sql_validation.utils import extract_qualified_columns, pad_tokens

if TYPE_CHECKING:
    from app.core.config import Settings

# Алиасы, которые не считаются таблицами в alias.col
SQL_KEYWORDS_FOR_COLCHECK = frozenset(
    {
        "select",
        "where",
        "from",
        "join",
        "on",
        "case",
        "when",
        "then",
        "else",
        "end",
        "over",
        "filter",
    }
)

_WHERE_CHUNK_RE = re.compile(
    r"\bwhere\b(.+?)(?=\bgroup\b|\border\b|\blimit\b|\bhaving\b|\bunion\b|\bintersect\b|\bexcept\b|$)",
    re.IGNORECASE | re.DOTALL,
)

_AGG_TOKEN_RE = re.compile(
    r"\b(count|sum|avg|min|max|stddev|variance|string_agg|array_agg|bool_and|bool_or)\s*\(",
    re.IGNORECASE,
)

_QUALIFIED_STAR_RE = re.compile(r"\b[a-z_][a-z0-9_]*\.\*", re.IGNORECASE)


def scan_dangerous_constructs(normalized: str, padded: str) -> tuple[list[str], list[str]]:
    """Возвращает (errors, warnings) для подозрительных конструкций."""
    errors: list[str] = []
    warnings: list[str] = []

    needles_error: list[tuple[str, str]] = [
        (" pg_sleep(", "Вызов pg_sleep запрещён."),
        (" pg_sleep (", "Вызов pg_sleep запрещён."),
        (" dblink", "Расширение dblink / внешние подключения в SQL запрещены."),
        (" lo_import", "Функции large-object (lo_*) запрещены."),
        (" lo_export", "Функции large-object (lo_*) запрещены."),
        (" into outfile", "Экспорт INTO OUTFILE запрещён."),
        (" into dumpfile", "Экспорт INTO DUMPFILE запрещён."),
        (" load_file(", "LOAD_FILE запрещён."),
        (" copy (", "COPY … TO PROGRAM / нестандартный COPY запрещён."),
        (" into ", "SELECT INTO / запись результата запрещены; разрешены только read-only SELECT."),
        (";--", "Обнаружен паттерн SQL-инъекции с комментарием после точки с запятой."),
        ("/*", "Блочные комментарии /* */ в SQL запрещены."),
        ("*/", "Блочные комментарии /* */ в SQL запрещены."),
    ]
    for needle, msg in needles_error:
        if needle in padded:
            errors.append(msg)

    # Системные каталоги (явное сообщение в дополнение к whitelist схем).
    if "information_schema" in padded:
        errors.append("Обращение к information_schema запрещено политикой безопасности.")
    if "pg_catalog" in padded:
        errors.append("Обращение к pg_catalog запрещено политикой безопасности.")

    # Inline «--» (отдельно от pad-only « --», ловит «1--» и начало строки).
    if re.search(r"(^|\s)--", normalized):
        errors.append("SQL-комментарии «--» запрещены (inline-комментарий).")

    if " cross join " in padded:
        warnings.append("Обнаружен CROSS JOIN — возможен взрыв числа строк; запрос должен быть жёстко ограничен LIMIT/фильтрами.")
    if " natural join " in padded:
        warnings.append("NATURAL JOIN скрывает соответствие колонок; для продуктивных запросов не рекомендуется.")
    if padded.count(" join ") >= 3:
        warnings.append("Много JOIN подряд — повышенная сложность плана и риск декартова произведения.")
    if " union " in padded:
        warnings.append("UNION увеличивает риск объединения несвязанных наборов данных; будет проверен источник данных.")
        suspicious_sources = ("information_schema", "pg_catalog", "pg_user", "pg_roles", "mysql.", "sqlite_master")
        if any(src in padded for src in suspicious_sources):
            errors.append("UNION с системными/служебными источниками запрещён политикой безопасности.")

    return errors, warnings


def check_bare_select_star(normalized: str) -> bool:
    """True, если есть опасный SELECT * / , * / alias.* (кроме COUNT(*)-подобных фрагментов)."""
    s = re.sub(r"\bcount\s*\(\s*\*\s*\)", " ", normalized, flags=re.IGNORECASE)
    if re.search(r"\bselect\s+\*", s):
        return True
    if re.search(r",\s*\*", s):
        return True
    if _QUALIFIED_STAR_RE.search(s):
        return True
    return False


def check_global_column_whitelist(
    *,
    normalized: str,
    alias_map: dict[str, str],
    cte_names: set[str],
    physical_tables: set[str],
    global_cols: set[str],
) -> tuple[list[str], list[str]]:
    """Глобальная проверка: физические таблицы — только whitelisted колонки в qualified refs."""
    errors: list[str] = []
    warnings: list[str] = []
    for alias, col in extract_qualified_columns(normalized):
        if alias in SQL_KEYWORDS_FOR_COLCHECK:
            continue
        table = alias_map.get(alias)
        if not table:
            warnings.append(f"Не удалось сопоставить алиас «{alias}» с таблицей для проверки колонки «{col}».")
            continue
        if table in cte_names:
            continue
        if table not in physical_tables:
            continue
        if col in global_cols:
            continue
        errors.append(f"Колонка не в глобальном whitelist: {table}.{col}")
    return errors, warnings


def check_time_filter_heuristic(normalized: str, physical_tables: set[str]) -> list[str]:
    """Предупреждение, если по основной факт-таблице нет явного упоминания времени в запросе."""
    notes: list[str] = []
    if not physical_tables & {"train", "user_staging"}:
        return notes
    if "order_timestamp" in normalized or "tender_timestamp" in normalized:
        return notes
    notes.append(
        "Не обнаружены колонки order_timestamp/tender_timestamp — возможен полный проход по партиции без временного фильтра."
    )
    return notes


def check_group_by_heuristic(normalized: str) -> list[str]:
    notes: list[str] = []
    if " group by " not in pad_tokens(normalized):
        if _AGG_TOKEN_RE.search(normalized):
            notes.append("Есть агрегатные функции без GROUP BY — допустимо только для одиночной метрики (summary).")
        return notes
    if re.search(r"\bgroup\s+by\s+\d+\b", normalized):
        notes.append("Используется позиционный GROUP BY (GROUP BY n) — убедитесь, что порядок полей SELECT стабилен.")
        return notes
    notes.append(
        "Присутствует GROUP BY: проверьте, что все неагрегированные поля SELECT входят в GROUP BY (эвристика MVP, без полного парсера)."
    )
    return notes


def extract_where_human_chunks(where_sql: str) -> list[str]:
    parts = [p.strip() for p in where_sql.split(" and ") if p.strip()]
    return parts[:24]


def build_query_explanation(
    *,
    normalized: str,
    accessible_tables: list[str],
    entities: Optional[dict[str, Any]],
    intent: Optional[str],
) -> dict[str, Any]:
    ent = dict(entities or {})
    filters_ru: list[str] = []
    wm = _WHERE_CHUNK_RE.search(normalized)
    if wm:
        chunk = wm.group(1).strip()
        filters_ru = extract_where_human_chunks(chunk)

    metric_key = str(ent.get("canonical_metric_key") or ent.get("metric_hint") or "").strip()
    metric_line = metric_key or "см. SQL (метрика из semantic / шаблона)"

    grouping = "нет явной группировки"
    if " group by " in pad_tokens(normalized):
        gb = re.search(r"\bgroup\s+by\b(.+?)(?=\border\b|\blimit\b|\bhaving\b|$)", normalized, re.IGNORECASE | re.DOTALL)
        if gb:
            grouping = gb.group(1).strip()[:400]

    return {
        "tables_used": sorted(accessible_tables),
        "filters_applied": filters_ru,
        "metric_summary_ru": f"Каноническая метрика (если задана): {metric_line}",
        "grouping": grouping,
        "intent": intent or "",
    }


def build_preview_assessment(
    *,
    normalized: str,
    padded: str,
    sql_default_limit: int,
    has_time_tokens: bool,
) -> dict[str, Any]:
    score = 12 + min(15, len(normalized) // 6000)
    warns: list[str] = []
    if padded.count(" join ") >= 2:
        score += 18
        warns.append("Несколько JOIN — сложность выше средней.")
    if " cross join " in padded:
        score += 35
        warns.append("CROSS JOIN сильно повышает оценку риска.")
    if " with " in padded and " as (" in padded:
        score += 10
        warns.append("CTE увеличивает читаемость, но может усложнить план.")
    if not has_time_tokens and (" from " in padded):
        score += 22
        warns.append("Нет явного временного поля — возможен широкий скан.")
    if " select " in padded and padded.count(" select ") >= 2:
        score += 15
        warns.append("Вложенные подзапросы SELECT — повышенная сложность.")

    scan_risk = "low"
    if score >= 55:
        scan_risk = "high"
    elif score >= 30:
        scan_risk = "medium"

    return {
        "complexity_score": min(100, score),
        "scan_risk": scan_risk,
        "warnings": warns,
        "policy_max_rows": sql_default_limit,
        "simplification_hint_ru": (
            f"Жёсткий потолок выборки: LIMIT не более {sql_default_limit} строк; таймаут выполнения задаётся в настройках API."
        ),
    }


def build_data_correctness(
    *,
    column_errors: list[str],
    group_notes: list[str],
    time_notes: list[str],
    empty_result: bool,
) -> dict[str, Any]:
    return {
        "unknown_or_disallowed_columns": column_errors,
        "group_by_checks": group_notes,
        "time_window_checks": time_notes,
        "empty_result": empty_result,
    }


def mandatory_limit_intent_set(settings: "Settings") -> set[str]:
    """Интенты, для которых LIMIT обязателен (добавляется валидатором, если отсутствует)."""
    raw = settings.sql_intents_require_limit
    if isinstance(raw, (list, tuple, set)):
        return {str(x).strip().lower() for x in raw if str(x).strip()}
    return {"ranking", "geo", "comparison", "share", "trend", "forecast"}


_INTERVAL_UNIT_RE = re.compile(
    r"interval\s+'(\d+)\s*(day|days|week|weeks|month|months|year|years)'",
    re.IGNORECASE,
)


def _interval_to_days(n: int, unit: str) -> int:
    u = unit.lower()
    if u.startswith("day"):
        return n
    if u.startswith("week"):
        return n * 7
    if u.startswith("month"):
        return n * 31
    if u.startswith("year"):
        return n * 366
    return n


def estimate_window_days_from_sql(normalized: str) -> Optional[int]:
    """Грубая оценка окна по литералам interval 'N unit' в SQL (для предупреждений)."""
    best: Optional[int] = None
    for m in _INTERVAL_UNIT_RE.finditer(normalized):
        try:
            n = int(m.group(1))
            days = _interval_to_days(n, str(m.group(2) or "day"))
        except (TypeError, ValueError):
            continue
        best = days if best is None else max(best, days)
    return best


def count_group_by_columns(normalized: str) -> int:
    m = re.search(
        r"\bgroup\s+by\b(.+?)(?=\border\b|\blimit\b|\bhaving\b|$)",
        normalized,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return 0
    body = m.group(1).strip()
    if not body:
        return 0
    depth = 0
    chunks: list[str] = []
    cur: list[str] = []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        elif ch == "," and depth == 0:
            piece = "".join(cur).strip()
            if piece:
                chunks.append(piece)
            cur = []
            continue
        cur.append(ch)
    tail = "".join(cur).strip()
    if tail:
        chunks.append(tail)
    return len(chunks)


def build_performance_assessment(
    *,
    normalized: str,
    padded: str,
    preview_assessment: dict[str, Any],
    entities: Optional[dict[str, Any]],
    settings: "Settings",
) -> dict[str, Any]:
    """
    Сложность запроса, предупреждения для UI и рекомендуемый потолок строк (sample / safety cap).
    """
    ent = dict(entities or {})
    explain: list[str] = []
    score = int(preview_assessment.get("complexity_score") or 0)
    scan_risk = str(preview_assessment.get("scan_risk") or "low")

    warn_days = int(getattr(settings, "sql_warn_scan_period_days", 90) or 90)
    hard_days = int(getattr(settings, "sql_hard_scan_period_days", 730) or 730)
    warn_gb = int(getattr(settings, "sql_warn_group_by_columns", 5) or 5)
    slow_score = int(getattr(settings, "sql_slow_query_complexity_score", 50) or 50)
    sample_score = int(getattr(settings, "sql_sample_complexity_score_min", 55) or 55)

    win_ent: Optional[int] = None
    raw_wd = ent.get("window_days")
    try:
        if raw_wd is not None:
            win_ent = max(1, int(raw_wd))
    except (TypeError, ValueError):
        win_ent = None
    win_sql = estimate_window_days_from_sql(normalized)
    _cand_days = [x for x in (win_ent, win_sql) if x is not None]
    window_days = max(_cand_days) if _cand_days else None

    if window_days is not None:
        if window_days > hard_days:
            explain.append(
                f"Период слишком большой (≈{window_days} дн.); сузьте окно или используйте предсуточные агрегаты."
            )
        elif window_days > warn_days:
            explain.append("Период слишком большой — запрос может выполняться долго.")

    gb_n = count_group_by_columns(normalized)
    if gb_n > warn_gb:
        explain.append(
            f"Много измерений в GROUP BY ({gb_n}) — рассмотрите меньшую детализацию или предварительные агрегаты."
        )

    if " where " not in padded and " from " in padded:
        explain.append("Подозрительное отсутствие фильтров WHERE — возможен тяжёлый полный скан.")

    if score >= slow_score or scan_risk == "high":
        explain.append("Запрос может выполняться долго.")

    hard_cap = int(getattr(settings, "sql_execution_hard_row_cap", 5000) or 5000)
    default_lim = int(getattr(settings, "sql_default_limit", 1000) or 1000)
    sample_max = int(getattr(settings, "sql_sample_max_rows", 300) or 300)
    fetch_cap = min(default_lim, hard_cap)
    sample_applied = False
    if score >= sample_score or scan_risk == "high":
        new_cap = min(fetch_cap, sample_max)
        if new_cap < fetch_cap:
            sample_applied = True
            fetch_cap = new_cap
            explain.append("Для ускорения система сократила детализацию (уменьшен LIMIT выборки).")

    rollup_hint = ""
    if (window_days or 0) > 30 or gb_n > 3:
        rollup_hint = (
            "Для MVP ускорения повторяющихся отчётов можно вынести предсуточные суммы/метрики "
            "в materialized view или отдельную таблицу агрегатов вне приложения."
        )

    return {
        "explain_warnings_ru": explain,
        "fetch_cap": fetch_cap,
        "sample_mode_applied": sample_applied,
        "window_days_estimate": window_days,
        "group_by_columns": gb_n,
        "rollup_recommendation_ru": rollup_hint,
        "pagination_hint_ru": "Постраничный просмотр: используйте меньший LIMIT и OFFSET на уровне API/отчёта.",
    }


def collect_schema_and_table_ref_errors(
    *,
    qualified_refs: list[tuple[str, str]],
    settings: "Settings",
) -> list[str]:
    """Ошибки по схеме whitelist и допустимости пары schema.table (включая staging t_*)."""
    errors: list[str] = []
    allowed_schemas = {s.strip().lower() for s in settings.sql_whitelist_schemas if s.strip()}
    global_tables = {t.strip().lower() for t in settings.sql_whitelist_tables}
    staging_schema = (settings.csv_staging_schema or "user_staging").strip().lower()
    implicit = (settings.sql_implicit_schema or "public").strip().lower() or "public"
    pattern = getattr(settings, "sql_staging_upload_table_pattern", r"^t_[a-f0-9]{12}$") or r"^t_[a-f0-9]{12}$"
    try:
        staging_re = re.compile(pattern, re.IGNORECASE)
    except re.error:
        staging_re = re.compile(r"^t_[a-f0-9]{12}$", re.IGNORECASE)

    seen: set[tuple[str, str]] = set()
    for schema, table in qualified_refs:
        key = (schema, table)
        if key in seen:
            continue
        seen.add(key)
        sch = schema.strip().lower()
        tbl = table.strip().lower()
        if sch not in allowed_schemas:
            errors.append(f"Схема «{sch}» не в whitelist разрешённых схем.")
            continue
        if tbl in global_tables:
            if tbl == "train" and sch != implicit:
                errors.append("Таблица train разрешена только в схеме по умолчанию (public).")
            continue
        if sch == staging_schema and staging_re.fullmatch(tbl):
            continue
        errors.append(f"Таблица «{sch}.{tbl}» не разрешена политикой доступа к данным.")
    return errors


def check_sensitive_columns_for_role(
    *,
    normalized: str,
    alias_map: dict[str, str],
    cte_names: set[str],
    physical_basenames: set[str],
    role_key: Optional[str],
) -> list[str]:
    """Запрет ссылок на PII-подобные колонки для ролей вне admin/manager."""
    rk = (role_key or "").strip().lower()
    errors: list[str] = []
    for alias, col in extract_qualified_columns(normalized):
        if alias in SQL_KEYWORDS_FOR_COLCHECK:
            continue
        table = alias_map.get(alias)
        if not table or table in cte_names:
            continue
        if table not in physical_basenames:
            continue
        if col in SQL_SENSITIVE_COLUMNS_ALWAYS:
            errors.append(
                f"Колонка «{table}.{col}» запрещена политикой безопасности (секреты / персональные данные)."
            )
            continue
        if col not in SQL_SENSITIVE_COLUMNS:
            continue
        if rk in ROLES_SENSITIVE_COLUMNS_OK:
            continue
        errors.append(
            f"Колонка «{table}.{col}» недоступна для роли «{rk or 'unknown'}» "
            "(только admin/manager)."
        )
    return errors
