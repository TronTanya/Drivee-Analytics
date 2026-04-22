"""DeepSeek provider implementation via HTTP API."""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx

from app.services.llm.base_provider import LLMMessage, LLMProviderRequest, LLMProviderResponse
from app.services.llm.sanitization import mask_sensitive_map

logger = logging.getLogger(__name__)


class DeepSeekProvider:
    name = "deepseek"

    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        model: str,
        default_timeout_seconds: int,
        retries: int = 2,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._default_timeout_seconds = default_timeout_seconds
        self._retries = max(0, retries)

    def complete(self, request: LLMProviderRequest) -> LLMProviderResponse:
        timeout_s = request.timeout_seconds or self._default_timeout_seconds
        payload = {
            "model": self._model,
            "messages": [self._map_message(msg) for msg in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
        }
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}

        last_error: Exception | None = None
        for attempt in range(self._retries + 1):
            try:
                with httpx.Client(timeout=timeout_s) as client:
                    response = client.post(
                        f"{self._base_url}/chat/completions",
                        json=payload,
                        headers=headers,
                    )
                if response.status_code >= 400:
                    raise RuntimeError(f"DeepSeek HTTP {response.status_code}: {response.text[:350]}")
                data = response.json()
                text = self._extract_text(data)
                return LLMProviderResponse(text=text, model=self._model, provider=self.name)
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                logger.warning(
                    "deepseek_request_failed attempt=%s payload=%s error=%s",
                    attempt + 1,
                    mask_sensitive_map({"model": self._model, "temperature": payload["temperature"]}),
                    str(exc),
                )
                if attempt < self._retries:
                    time.sleep(0.25 * (attempt + 1))

        raise RuntimeError(f"DeepSeek provider failed after retries: {last_error}")

    @staticmethod
    def _map_message(msg: LLMMessage) -> dict[str, str]:
        role = msg.role if msg.role in {"system", "user", "assistant"} else "user"
        return {"role": role, "content": msg.content}

    @staticmethod
    def _extract_text(response_payload: dict[str, Any]) -> str:
        choices = response_payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise ValueError("DeepSeek response has no choices")
        first = choices[0] if isinstance(choices[0], dict) else {}
        message = first.get("message") if isinstance(first.get("message"), dict) else {}
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("DeepSeek response content is empty")
        return content
