"""Prompt sanitization and safe logging helpers."""

from __future__ import annotations

import re
from typing import Any

_EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_LONG_NUMBER_RE = re.compile(r"\b\d{9,}\b")
_SECRET_KEYS = ("api_key", "token", "password", "secret", "authorization", "cookie")


def sanitize_prompt_text(value: str, *, max_chars: int = 1600) -> str:
    text = " ".join((value or "").split())
    text = _EMAIL_RE.sub("[email]", text)
    text = _LONG_NUMBER_RE.sub("[number]", text)
    if len(text) > max_chars:
        text = f"{text[:max_chars]}..."
    return text


def mask_sensitive_map(payload: dict[str, Any]) -> dict[str, Any]:
    masked: dict[str, Any] = {}
    for key, value in payload.items():
        lk = key.lower()
        if any(secret_key in lk for secret_key in _SECRET_KEYS):
            masked[key] = "***"
            continue
        masked[key] = value
    return masked
