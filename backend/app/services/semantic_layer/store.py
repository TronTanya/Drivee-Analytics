from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable, Optional

from pydantic import BaseModel, Field, ValidationError

from app.schemas.dictionary_terms import DictionaryEntryResponse
from app.schemas.orchestration import SemanticTermResolution

logger = logging.getLogger(__name__)

_DEFAULT_VISIBILITY = ("admin", "manager", "marketer", "executive")

_CANCELLATION_PRIORITY: tuple[str, ...] = (
    "client_cancellations",
    "driver_cancellations",
    "cancellations_total",
)


def _normalize_match_text(value: str) -> str:
    return value.lower().replace("ё", "е").strip()


class SemanticLayerTerm(BaseModel):
    """Запись канонического словаря (источник правды для NL→SQL)."""

    id: str
    domain: str = ""
    business_term: str = ""
    business_terms: list[str] = Field(default_factory=list)
    canonical_metric_key: str = ""
    synonyms: list[str] = Field(default_factory=list)
    source_table: str = "anonymized_incity_orders"
    source_column: str | None = None
    aggregation_type: str = ""
    sql_expression: str = ""
    constraints: dict[str, Any] = Field(default_factory=dict)
    example_queries: list[str] = Field(default_factory=list)
    requires_join_campaigns: bool = False
    is_default: bool = False
    confidence: float = 0.9

    def match_patterns(self) -> tuple[str, ...]:
        raw: list[str] = []
        if self.business_term:
            raw.append(self.business_term)
        raw.extend(self.business_terms)
        raw.extend(self.synonyms)
        seen: set[str] = set()
        out: list[str] = []
        for item in raw:
            s = (item or "").strip()
            if not s:
                continue
            n = _normalize_match_text(s)
            if n and n not in seen:
                seen.add(n)
                out.append(n)
        return tuple(out)

    def system_interpretation_ru(self) -> str:
        parts = [
            f"Каноническая метрика: `{self.canonical_metric_key or self.id}`.",
            f"Домен: {self.domain or '—'}.",
            f"Источник: `{self.source_table}`"
            + (f", колонка `{self.source_column}`" if self.source_column else "")
            + ".",
            f"Агрегация: {self.aggregation_type or 'custom'}.",
        ]
        if self.constraints.get("notes"):
            parts.append(str(self.constraints["notes"]))
        return " ".join(parts)


def _default_dictionary_path() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "semantic_dictionary.json"


class SemanticDictionaryStore:
    """Загрузка JSON + поиск + резолв в SemanticTermResolution."""

    def __init__(self, terms: list[SemanticLayerTerm]) -> None:
        self._terms = list(terms)
        self._by_key: dict[str, SemanticLayerTerm] = {}
        for t in self._terms:
            key = t.canonical_metric_key or t.id
            self._by_key[key] = t

    @classmethod
    def load(cls, path: Path | None = None) -> "SemanticDictionaryStore":
        p = path or _default_dictionary_path()
        raw = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            raise ValueError("semantic_dictionary.json must be a JSON array")
        terms: list[SemanticLayerTerm] = []
        for i, item in enumerate(raw):
            if not isinstance(item, dict):
                continue
            try:
                terms.append(SemanticLayerTerm.model_validate(item))
            except ValidationError as exc:
                logger.error("semantic_dictionary_invalid index=%s err=%s", i, exc)
                raise
        return cls(terms)

    @property
    def terms(self) -> tuple[SemanticLayerTerm, ...]:
        return tuple(self._terms)

    def get_by_metric_key(self, key: str) -> SemanticLayerTerm | None:
        return self._by_key.get(key.strip())

    def default_term(self) -> SemanticLayerTerm:
        for t in self._terms:
            if t.is_default:
                return t
        for t in self._terms:
            if (t.canonical_metric_key or t.id) == "orders_count":
                return t
        return self._terms[0]

    def list_public(self, *, query: str | None = None) -> list[DictionaryEntryResponse]:
        items = [self._to_public(t) for t in self._terms]
        qn = _normalize_match_text(query) if query and query.strip() else ""
        if not qn:
            return sorted(items, key=lambda x: (x.domain, x.canonical_metric_key))
        return sorted(
            [e for e in items if self._entry_matches_query(e, qn)],
            key=lambda x: (x.domain, x.canonical_metric_key),
        )

    def get_public(self, entry_id: str) -> DictionaryEntryResponse | None:
        t = self._by_key.get(entry_id) or next((x for x in self._terms if x.id == entry_id), None)
        if not t:
            return None
        return self._to_public(t)

    def _entry_matches_query(self, entry: DictionaryEntryResponse, qn: str) -> bool:
        blob = " ".join(
            [
                entry.term,
                entry.canonical_metric_key,
                entry.domain,
                " ".join(entry.synonyms),
                entry.sql_expression,
            ]
        )
        return qn in _normalize_match_text(blob) or any(qn in _normalize_match_text(s) for s in entry.synonyms)

    def _to_public(self, t: SemanticLayerTerm) -> DictionaryEntryResponse:
        key = t.canonical_metric_key or t.id
        return DictionaryEntryResponse(
            id=t.id,
            term=t.business_term or key,
            synonyms=list({*(t.synonyms or []), *(t.business_terms or [])}),
            sql_expression=t.sql_expression,
            visibility_roles=list(_DEFAULT_VISIBILITY),
            domain=t.domain,
            canonical_metric_key=key,
            source_table=t.source_table,
            source_column=t.source_column,
            aggregation_type=t.aggregation_type,
            constraints=dict(t.constraints or {}),
            example_queries=list(t.example_queries or []),
            system_interpretation_ru=t.system_interpretation_ru(),
        )

    def resolve_query(self, query: str) -> list[SemanticTermResolution]:
        qn = _normalize_match_text(query)
        hits: list[SemanticTermResolution] = []
        for t in self._terms:
            matched: str | None = None
            best_len = 0
            for pat in t.match_patterns():
                if pat in qn and len(pat) > best_len:
                    matched = pat
                    best_len = len(pat)
            if matched:
                conf = float(t.confidence)
                if t.requires_join_campaigns:
                    conf = min(conf, 0.85)
                hits.append(
                    SemanticTermResolution(
                        term_key=t.canonical_metric_key or t.id,
                        surface_form=matched,
                        sql_fragment=t.sql_expression,
                        confidence=conf,
                    )
                )
        if hits:
            if "отмен" in qn or "cancel" in qn:
                pri = {k: i for i, k in enumerate(_CANCELLATION_PRIORITY)}

                def sort_key(h: SemanticTermResolution) -> tuple[int, float]:
                    return (pri.get(h.term_key, 99), -h.confidence)

                hits.sort(key=sort_key)
            return hits
        d = self.default_term()
        key = d.canonical_metric_key or d.id
        return [
            SemanticTermResolution(
                term_key=key,
                surface_form="default",
                sql_fragment=d.sql_expression,
                confidence=0.55,
            )
        ]

    def resolve_with_hint(self, query: str, metric_hint: Optional[str]) -> list[SemanticTermResolution]:
        hint = (metric_hint or "").strip()
        if hint:
            t = self.get_by_metric_key(hint)
            if t:
                anchored = SemanticTermResolution(
                    term_key=t.canonical_metric_key or t.id,
                    surface_form="interpretation",
                    sql_fragment=t.sql_expression,
                    confidence=0.93,
                )
                rest = [r for r in self.resolve_query(query) if r.term_key != anchored.term_key]
                return [anchored] + rest[:2]
        return self.resolve_query(query)

    def primary_metric_sql(self, resolutions: list[SemanticTermResolution]) -> str:
        if not resolutions:
            return self.default_term().sql_expression
        return resolutions[0].sql_fragment

    def needs_marketing_join(self, query: str) -> bool:
        qn = _normalize_match_text(query)
        for t in self._terms:
            if not t.requires_join_campaigns:
                continue
            for pat in t.match_patterns():
                if pat in qn:
                    return True
        return False


@lru_cache
def get_semantic_dictionary_store() -> SemanticDictionaryStore:
    return SemanticDictionaryStore.load()


def iter_terms_for_tests() -> Iterable[SemanticLayerTerm]:
    """Тестам: сброс кэша не требуется при обычном pytest."""
    return get_semantic_dictionary_store().terms
