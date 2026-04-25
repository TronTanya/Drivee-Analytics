"""Semantic layer: канонический словарь → SQL-фрагмент для anonymized in-city orders."""

from __future__ import annotations

from typing import Optional

from app.schemas.orchestration import SemanticTermResolution
from app.services.semantic_layer.store import SemanticDictionaryStore, get_semantic_dictionary_store


class SemanticService:
    """Прокси над SemanticDictionaryStore (JSON в app/data/semantic_dictionary.json)."""

    def __init__(self, store: Optional[SemanticDictionaryStore] = None) -> None:
        self._store = store or get_semantic_dictionary_store()

    def resolve_with_hint(self, query: str, metric_hint: Optional[str]) -> list[SemanticTermResolution]:
        """Если интерпретация зафиксировала metric_hint — приоритетно используем каноническую метрику."""
        return self._store.resolve_with_hint(query, metric_hint)

    def resolve(self, query: str) -> list[SemanticTermResolution]:
        return self._store.resolve_query(query)

    def primary_metric_sql(self, resolutions: list[SemanticTermResolution]) -> str:
        return self._store.primary_metric_sql(resolutions)

    def primary_source_table(self, resolutions: list[SemanticTermResolution]) -> str:
        return self._store.primary_source_table(resolutions)

    def needs_marketing_join(self, query: str) -> bool:
        return self._store.needs_marketing_join(query)

    def resolve_dimensions(self, query: str) -> list[str]:
        return self._store.resolve_dimensions(query)

    def resolve_filters(self, query: str) -> dict[str, str]:
        return self._store.resolve_filters(query)
