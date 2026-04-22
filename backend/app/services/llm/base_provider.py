"""LLM provider abstraction."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class LLMMessage:
    role: str
    content: str


@dataclass(frozen=True)
class LLMProviderRequest:
    messages: list[LLMMessage]
    temperature: float
    max_tokens: int
    timeout_seconds: int


@dataclass(frozen=True)
class LLMProviderResponse:
    text: str
    model: str
    provider: str


class BaseLLMProvider(Protocol):
    name: str

    def complete(self, request: LLMProviderRequest) -> LLMProviderResponse:
        """Run completion and return plain-text payload."""
        ...
