"""Parsing helpers for strict JSON structured outputs."""

from __future__ import annotations

import json
import re
from typing import Any, TypeVar

from pydantic import BaseModel, ValidationError

TModel = TypeVar("TModel", bound=BaseModel)

_FENCED_JSON_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)


def extract_json_object(raw: str) -> dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        raise ValueError("Empty provider response")

    fenced = _FENCED_JSON_RE.search(text)
    if fenced:
        text = fenced.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("JSON object not found in provider response")

    return json.loads(text[start : end + 1])


def parse_to_model(raw: str, model_cls: type[TModel]) -> TModel:
    payload = extract_json_object(raw)
    try:
        return model_cls.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(f"Model validation failed: {exc}") from exc
