"""Factory helpers for LLM providers and service wiring."""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional

from app.core.config import settings
from app.services.llm.base_provider import BaseLLMProvider
from app.services.llm.deepseek_provider import DeepSeekProvider
from app.services.llm.llm_service import LLMService

logger = logging.getLogger(__name__)


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


def log_llm_startup_summary() -> None:
    """Один раз при старте API: диагностика без секретов."""
    name = (settings.llm_provider or "").strip().lower()
    if name != "deepseek":
        if name:
            logger.warning("llm_startup disabled reason=unsupported_provider requested=%r", settings.llm_provider)
        else:
            logger.info("llm_startup disabled reason=LLM_PROVIDER_empty")
        return
    if not settings.deepseek_api_key.strip():
        logger.info("llm_startup disabled reason=missing_DEEPSEEK_API_KEY")
        return
    logger.info(
        "llm_startup enabled provider=deepseek model=%s timeout_s=%s max_tokens=%s",
        settings.deepseek_model,
        settings.llm_timeout_seconds,
        settings.llm_max_tokens,
    )


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
