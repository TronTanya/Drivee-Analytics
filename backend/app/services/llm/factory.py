"""Factory helpers for LLM providers and service wiring."""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from app.core.config import settings
from app.services.llm.base_provider import BaseLLMProvider
from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.llm_service import LLMService


def build_provider() -> Optional[BaseLLMProvider]:
    provider_name = (settings.llm_provider or "").strip().lower()
    if provider_name == "deepseek":
        if not settings.deepseek_api_key.strip():
            return None
        return DeepSeekProvider(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            model=settings.deepseek_model,
            default_timeout_seconds=settings.llm_timeout_seconds,
            retries=2,
        )
    return None


@lru_cache
def get_llm_service() -> LLMService:
    provider = build_provider()
    return LLMService(
        provider=provider,
        temperature=settings.llm_temperature,
        max_tokens=settings.llm_max_tokens,
        timeout_seconds=settings.llm_timeout_seconds,
        failure_threshold=settings.llm_failure_threshold,
        cooldown_seconds=settings.llm_cooldown_seconds,
    )
