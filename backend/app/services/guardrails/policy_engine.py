"""Политика: метрики по ролям, анти-абьюз по длине промпта и частоте запросов."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Optional

from app.core.config import Settings
from app.core.guardrails_constants import ROLE_ALLOWED_CANONICAL_METRICS

_RATE_BUCKETS: dict[str, deque[float]] = defaultdict(deque)


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


def check_prompt_abuse(prompt: str, settings: Settings) -> list[str]:
    errors: list[str] = []
    max_chars = int(getattr(settings, "guardrails_max_prompt_chars", 8000) or 8000)
    if len(prompt) > max_chars:
        errors.append(f"Промпт слишком длинный (>{max_chars} символов). Сократите запрос.")
    max_nl = int(getattr(settings, "guardrails_max_prompt_newlines", 80) or 80)
    if prompt.count("\n") > max_nl:
        errors.append(f"Слишком много переносов строк в промпте (>{max_nl}).")
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
