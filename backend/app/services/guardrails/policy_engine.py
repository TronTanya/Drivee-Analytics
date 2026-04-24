"""Политика: метрики по ролям, анти-абьюз по длине промпта и частоте запросов."""

from __future__ import annotations

import re
import time
from collections import defaultdict, deque
from typing import Optional

from app.core.config import Settings
from app.core.guardrails_constants import ROLE_ALLOWED_CANONICAL_METRICS

_RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)

# Zero-width / BOM — не «текст запроса», но обходят .strip() и длину визуально.
_ZERO_WIDTH_AND_BOM = frozenset(("\u200b", "\u200c", "\u200d", "\ufeff"))
# Запрещённые управляющие C0 (кроме \t \n \r), DEL — анти-инъекции в логи/парсеры.
_DISALLOWED_CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _prompt_without_zw(prompt: str) -> str:
    return "".join(c for c in prompt if c not in _ZERO_WIDTH_AND_BOM)


def evaluate_canonical_metric_for_role(
    *,
    role_key: Optional[str],
    canonical_metric_key: Optional[str],
) -> list[str]:
    """Возвращает список ошибок политики (пусто = ок)."""
    rk = (role_key or "").strip().lower()
    if not rk:
        rk = "manager"
    allowed = ROLE_ALLOWED_CANONICAL_METRICS.get(rk)
    if allowed is None:
        return []
    mk = (canonical_metric_key or "").strip().lower()
    if not mk:
        return []
    if mk not in allowed:
        return [
            f"Метрика «{mk}» недоступна для роли «{rk}». "
            f"Разрешены: {', '.join(sorted(allowed))}."
        ]
    return []


def evaluate_entities_for_role(*, role_key: Optional[str], entities: Optional[dict[str, object]]) -> list[str]:
    """Проверки доступа роли к чувствительным сущностям в NL-слое (до SQL)."""
    rk = (role_key or "").strip().lower()
    if rk != "executive":
        return []
    ent = dict(entities or {})
    forbidden_keys = {"user_id", "driver_id", "phone", "email", "iin", "passport_id"}
    touched: list[str] = []
    for key in forbidden_keys:
        value = ent.get(key)
        if value not in (None, "", [], ()):
            touched.append(key)
    raw_filters = ent.get("filter_candidates")
    if isinstance(raw_filters, list):
        for item in raw_filters:
            as_text = str(item).lower()
            if any(k in as_text for k in forbidden_keys):
                touched.append(str(item))
    if not touched:
        return []
    touched_u = sorted(dict.fromkeys(touched))
    return [
        "Запрос содержит чувствительные сущности, недоступные для роли «executive»: "
        + ", ".join(touched_u)
        + "."
    ]


def check_prompt_abuse(prompt: str, settings: Settings) -> list[str]:
    errors: list[str] = []
    if _DISALLOWED_CTRL.search(prompt):
        errors.append("Промпт содержит недопустимые управляющие символы (кроме обычных переносов строк).")
    visible = _prompt_without_zw(prompt)
    if not visible.strip():
        errors.append("Промпт пустой или состоит только из пробелов и невидимых символов.")
    max_chars = int(getattr(settings, "guardrails_max_prompt_chars", 8000) or 8000)
    if len(prompt) > max_chars:
        errors.append(f"Промпт слишком длинный (>{max_chars} символов). Сократите запрос.")
    max_nl = int(getattr(settings, "guardrails_max_prompt_newlines", 80) or 80)
    if prompt.count("\n") > max_nl:
        errors.append(f"Слишком много переносов строк в промпте (>{max_nl}).")
    lines = [ln for ln in prompt.splitlines() if ln.strip()]
    if len(lines) >= 8:
        short_lines = sum(1 for ln in lines if len(ln.strip()) <= 2)
        if short_lines >= 5:
            errors.append("Подозрительный multi-line ввод: слишком много коротких строк без аналитического контекста.")
    return errors


def check_rate_limit(
    *,
    settings: Settings,
    user_id: Optional[str],
    role_key: Optional[str],
) -> list[str]:
    if not getattr(settings, "guardrails_rate_limit_enabled", True):
        return []
    window_sec = max(10, int(getattr(settings, "guardrails_rate_limit_window_seconds", 60) or 60))
    max_req = max(1, int(getattr(settings, "guardrails_max_requests_per_window", 40) or 40))
    key = user_id or role_key or "anonymous"
    now = time.monotonic()
    dq = _RATE_BUCKETS[key]
    while dq and now - dq[0] > window_sec:
        dq.popleft()
    if len(dq) >= max_req:
        return [f"Превышен лимит запросов ({max_req} за {window_sec} с). Подождите и повторите."]
    dq.append(now)
    return []
