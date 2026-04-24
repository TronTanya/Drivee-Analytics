"""Дополнительный слой SQL safety (MVP): UNION-политика, маркеры много-выражений.

Основная валидация остаётся в `SQLValidatorService`; здесь — быстрые инварианты,
которые проще тестировать изолированно и явно логировать в trace.
"""

from __future__ import annotations

import re
from typing import List

# После нормализации пробелов — ищем UNION как отдельный токен (не подстроку в идентификаторе).
_UNION_TOKEN_RE = re.compile(r"(?<![\w])union(?![\w])", re.IGNORECASE)

# Подозрительный шаблон «закрыть комментарий и начать новое выражение».
_COMMENT_SPLIT_INJECTION_RE = re.compile(r"\*/\s*;", re.IGNORECASE)


def collect_sql_mvp_safety_violations(sql: str, *, allow_union: bool = False) -> List[str]:
    """Возвращает человекочитаемые причины отказа (англ.), пустой список если ок."""
    violations: List[str] = []
    raw = (sql or "").strip()
    if not raw:
        return violations

    if _COMMENT_SPLIT_INJECTION_RE.search(raw):
        violations.append("Suspicious comment terminator followed by semicolon (possible statement chaining).")

    low = " ".join(raw.split()).lower()

    if not allow_union and _UNION_TOKEN_RE.search(low):
        violations.append("UNION is not allowed for generated analytics SQL (enable sql_allow_union to override).")

    return violations
