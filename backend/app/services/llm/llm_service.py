"""LLM use-case service with structured parsing and graceful failures."""

from __future__ import annotations

import logging
import time
from typing import Any, Optional, TypeVar

from pydantic import BaseModel

from app.schemas.llm import (
    LLMClarificationResult,
    LLMExplainabilityResult,
    LLMFollowUpRewriteResult,
    LLMInsightResult,
    LLMQueryInterpretation,
)
from app.services.llm.base_provider import BaseLLMProvider, LLMMessage, LLMProviderRequest
from app.services.llm.parsers import parse_to_model
from app.services.llm.prompt_templates import PromptTask, build_prompt
from app.services.llm.sanitization import sanitize_prompt_text

logger = logging.getLogger(__name__)

TModel = TypeVar("TModel", bound=BaseModel)


class LLMService:
    def __init__(
        self,
        *,
        provider: Optional[BaseLLMProvider],
        temperature: float,
        max_tokens: int,
        timeout_seconds: int,
        failure_threshold: int = 3,
        cooldown_seconds: int = 45,
    ) -> None:
        self._provider = provider
        self._temperature = float(temperature)
        self._max_tokens = int(max_tokens)
        self._timeout_seconds = int(timeout_seconds)
        self._failure_threshold = max(1, int(failure_threshold))
        self._cooldown_seconds = max(5, int(cooldown_seconds))
        self._consecutive_failures = 0
        self._disabled_until_epoch = 0.0

    @property
    def is_enabled(self) -> bool:
        return self._provider is not None

    @property
    def provider_name(self) -> str:
        if self._provider is None:
            return "disabled"
        return getattr(self._provider, "name", "unknown")

    def interpret_user_query(
        self,
        *,
        query: str,
    ) -> Optional[LLMQueryInterpretation]:
        return self._run_structured(
            task="query_interpretation",
            payload={"query": query},
            model_cls=LLMQueryInterpretation,
        )

    def generate_clarification(
        self,
        *,
        query: str,
        intent: str,
        entities: dict[str, Any],
        semantic_terms: list[dict[str, Any]],
    ) -> Optional[LLMClarificationResult]:
        return self._run_structured(
            task="clarification_generation",
            payload={
                "query": query,
                "intent": intent,
                "entities": entities,
                "semantic_terms": semantic_terms,
            },
            model_cls=LLMClarificationResult,
        )

    def rewrite_followup_query_with_context(
        self,
        *,
        query: str,
        base_query: str,
        context: dict[str, Any],
    ) -> Optional[LLMFollowUpRewriteResult]:
        return self._run_structured(
            task="followup_rewrite",
            payload={"query": query, "base_query": base_query, "context": context},
            model_cls=LLMFollowUpRewriteResult,
        )

    def generate_explainability_text(
        self,
        *,
        query: str,
        intent: str,
        entities: dict[str, Any],
        clarification_required: bool,
    ) -> Optional[LLMExplainabilityResult]:
        return self._run_structured(
            task="explainability_text",
            payload={
                "query": query,
                "intent": intent,
                "entities": entities,
                "clarification_required": clarification_required,
            },
            model_cls=LLMExplainabilityResult,
        )

    def generate_insight_text(
        self,
        *,
        intent: str,
        columns: list[str],
        rows: list[dict[str, Any]],
    ) -> Optional[LLMInsightResult]:
        return self._run_structured(
            task="insight_generation",
            payload={"intent": intent, "columns": columns, "rows": rows},
            model_cls=LLMInsightResult,
        )

    def _run_structured(
        self,
        *,
        task: PromptTask,
        payload: dict[str, Any],
        model_cls: type[TModel],
    ) -> Optional[TModel]:
        if self._provider is None:
            return None
        now = time.time()
        if now < self._disabled_until_epoch:
            logger.info(
                "llm_temporarily_disabled provider=%s wait_seconds=%s",
                getattr(self._provider, "name", "unknown"),
                int(self._disabled_until_epoch - now),
            )
            return None

        prompt = build_prompt(task, payload)
        request = LLMProviderRequest(
            messages=[
                LLMMessage(role="system", content=prompt.system_prompt),
                LLMMessage(role="user", content=prompt.user_prompt),
            ],
            temperature=self._temperature,
            max_tokens=self._max_tokens,
            timeout_seconds=self._timeout_seconds,
        )
        try:
            response = self._provider.complete(request)
            parsed = parse_to_model(response.text, model_cls)
            self._consecutive_failures = 0
            return parsed
        except Exception as exc:  # noqa: BLE001
            self._consecutive_failures += 1
            if self._consecutive_failures >= self._failure_threshold:
                self._disabled_until_epoch = time.time() + self._cooldown_seconds
                logger.warning(
                    "llm_circuit_open provider=%s failures=%s cooldown_seconds=%s",
                    getattr(self._provider, "name", "unknown"),
                    self._consecutive_failures,
                    self._cooldown_seconds,
                )
            logger.warning(
                "llm_task_failed provider=%s task=%s error=%s payload=%s",
                getattr(self._provider, "name", "unknown"),
                task,
                str(exc),
                sanitize_prompt_text(str(payload), max_chars=240),
            )
            return None
