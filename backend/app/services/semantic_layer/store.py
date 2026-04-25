from __future__ import annotations

import json
import logging
import re
import hashlib
from datetime import datetime, timezone
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
    "cancellation_rate",
)

_TRAIN_BOOTSTRAP_TERMS: tuple[dict[str, Any], ...] = (
    {
        "id": "dim_city",
        "term": "Город",
        "synonyms": ["город", "города", "по городам", "city", "cities", "city_id"],
        "sql_expression": "a.city_id::text",
        "domain": "dimensions_filters",
        "canonical_metric_key": "city",
        "source_column": "city_id",
        "aggregation_type": "group_by",
        "term_type": "dimension",
        "target_field": "city_id",
        "description_ru": "Измерение city_id для группировок и ранжирования.",
        "example_queries": ["Покажи выручку по городам за прошлую неделю"],
    },
    {
        "id": "dim_channel",
        "term": "Канал",
        "synonyms": ["канал", "каналы", "по каналам", "channel", "order channel"],
        "sql_expression": "a.order_channel::text",
        "domain": "dimensions_filters",
        "canonical_metric_key": "channel",
        "source_column": "order_channel",
        "aggregation_type": "group_by",
        "term_type": "dimension",
        "target_field": "order_channel",
        "description_ru": "Измерение каналов заказа для сравнений и рейтингов.",
        "example_queries": ["Сравни количество заказов по каналам за март"],
    },
    {
        "id": "flt_previous_week",
        "term": "Прошлая неделя",
        "synonyms": ["прошлая неделя", "за прошлую неделю", "previous week", "last week"],
        "sql_expression": "time_period=previous_week",
        "domain": "dimensions_filters",
        "canonical_metric_key": "time_previous_week",
        "source_column": "order_timestamp",
        "aggregation_type": "time_filter",
        "term_type": "filter",
        "target_field": "time_period",
        "filter_value": "previous_week",
        "description_ru": "Фильтр периода: предыдущая календарная неделя.",
        "example_queries": ["Покажи динамику отмен по дням за прошлую неделю"],
    },
    {
        "id": "price_tender_sum",
        "term": "Сумма тендеров",
        "synonyms": ["сумма тендеров", "tender sum", "total tender price"],
        "sql_expression": "SUM(a.price_tender_local)",
        "domain": "orders_rides",
        "canonical_metric_key": "price_tender_sum",
        "source_column": "price_tender_local",
        "aggregation_type": "sum",
        "example_queries": ["Покажи сумму тендеров по городам за месяц"],
    },
    {
        "id": "order_channel_count",
        "term": "Заказы по каналу",
        "synonyms": ["канал заказа", "order channel", "каналы заказов"],
        "sql_expression": "COUNT(*)",
        "domain": "orders_rides",
        "canonical_metric_key": "order_channel_count",
        "source_column": "order_channel",
        "aggregation_type": "count",
        "example_queries": ["Покажи число заказов по каналам"],
    },
    {
        "id": "avg_price_tender_local",
        "term": "Средняя цена тендера",
        "synonyms": ["средняя цена тендера", "avg tender price"],
        "sql_expression": "AVG(a.price_tender_local)",
        "domain": "orders_rides",
        "canonical_metric_key": "avg_price_tender_local",
        "source_column": "price_tender_local",
        "aggregation_type": "avg",
        "example_queries": ["Средняя цена тендера по city_id"],
    },
    {
        "id": "avg_price_start_local",
        "term": "Средняя стартовая цена",
        "synonyms": ["стартовая цена", "avg start price", "средняя стартовая стоимость"],
        "sql_expression": "AVG(a.price_start_local)",
        "domain": "orders_rides",
        "canonical_metric_key": "avg_price_start_local",
        "source_column": "price_start_local",
        "aggregation_type": "avg",
        "example_queries": ["Покажи среднюю стартовую цену по городам"],
    },
    {
        "id": "train_row_count",
        "term": "Строки train",
        "synonyms": ["количество записей", "число строк", "row count", "строк датасет"],
        "sql_expression": "COUNT(*)",
        "domain": "orders_rides",
        "canonical_metric_key": "train_row_count",
        "aggregation_type": "count",
        "description_ru": "COUNT(*) по выборке train.",
        "example_queries": ["Сколько строк в train за вчера?"],
    },
    {
        "id": "distinct_orders",
        "term": "Уникальные заказы",
        "synonyms": ["уникальн заказ", "distinct order", "разных заказ"],
        "sql_expression": "COUNT(DISTINCT a.order_id)",
        "domain": "orders_rides",
        "canonical_metric_key": "distinct_orders",
        "source_column": "order_id",
        "aggregation_type": "count_distinct",
        "description_ru": "COUNT(DISTINCT order_id).",
        "example_queries": ["Сколько уникальных заказов за неделю?"],
    },
    {
        "id": "cancellation_rate",
        "term": "Доля отмен",
        "synonyms": ["доля отмен", "процент отмен", "cancellation rate", "cancel rate"],
        "sql_expression": "COUNT(CASE WHEN a.clientcancel_timestamp IS NOT NULL OR a.drivercancel_timestamp IS NOT NULL THEN 1 END)::float / NULLIF(COUNT(*), 0)",
        "domain": "cancellations_revenue",
        "canonical_metric_key": "cancellation_rate",
        "aggregation_type": "ratio",
        "description_ru": "Отмены / COUNT(*) по строкам train.",
        "example_queries": ["Какая доля отмен по каналам?"],
    },
    {
        "id": "dim_status_order",
        "term": "Статус заказа",
        "synonyms": ["статус заказ", "status order", "по статусу заказ"],
        "sql_expression": "a.status_order::text",
        "domain": "dimensions_filters",
        "canonical_metric_key": "status_order_dim",
        "source_column": "status_order",
        "aggregation_type": "group_by",
        "term_type": "dimension",
        "target_field": "status_order",
        "description_ru": "Колонка train.status_order.",
        "example_queries": ["Распределение по status_order"],
    },
    {
        "id": "dim_status_tender",
        "term": "Статус тендера",
        "synonyms": ["статус тендер", "status tender"],
        "sql_expression": "a.status_tender::text",
        "domain": "dimensions_filters",
        "canonical_metric_key": "status_tender_dim",
        "source_column": "status_tender",
        "aggregation_type": "group_by",
        "term_type": "dimension",
        "target_field": "status_tender",
        "description_ru": "Колонка train.status_tender.",
        "example_queries": ["По status_tender и каналу"],
    },
    {
        "id": "dim_offset_hours",
        "term": "Смещение часового пояса",
        "synonyms": ["offset hours", "смещен часов", "часовой пояс города"],
        "sql_expression": "a.offset_hours::text",
        "domain": "dimensions_filters",
        "canonical_metric_key": "offset_hours_dim",
        "source_column": "offset_hours",
        "aggregation_type": "group_by",
        "term_type": "dimension",
        "target_field": "offset_hours",
        "description_ru": "train.offset_hours (целое смещение UTC).",
        "example_queries": ["По offset_hours"],
    },
    {
        "id": "dim_user_pseudo",
        "term": "Псевдоним пользователя",
        "synonyms": ["user id", "ид пользовател"],
        "sql_expression": "a.user_id::text",
        "domain": "dimensions_filters",
        "canonical_metric_key": "user_id_dim",
        "source_column": "user_id",
        "aggregation_type": "group_by",
        "term_type": "dimension",
        "target_field": "user_id",
        "description_ru": "train.user_id (TEXT), чувствительное поле.",
        "example_queries": [],
    },
    {
        "id": "dim_driver_pseudo",
        "term": "Псевдоним водителя",
        "synonyms": ["driver id", "ид водител"],
        "sql_expression": "a.driver_id::text",
        "domain": "dimensions_filters",
        "canonical_metric_key": "driver_id_dim",
        "source_column": "driver_id",
        "aggregation_type": "group_by",
        "term_type": "dimension",
        "target_field": "driver_id",
        "description_ru": "train.driver_id (TEXT), чувствительное поле.",
        "example_queries": [],
    },
    {
        "id": "flt_yesterday",
        "term": "Вчера",
        "synonyms": ["вчера", "за вчера", "yesterday"],
        "sql_expression": "time_period=yesterday",
        "domain": "dimensions_filters",
        "canonical_metric_key": "time_yesterday",
        "source_column": "order_timestamp",
        "aggregation_type": "time_filter",
        "term_type": "filter",
        "target_field": "time_period",
        "filter_value": "yesterday",
        "description_ru": "Календарное вчера по order_timestamp.",
        "example_queries": ["Сколько отмен было вчера?"],
    },
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
    source_table: str = "train"
    source_column: str | None = None
    aggregation_type: str = ""
    term_type: str = "metric"
    target_field: str | None = None
    filter_value: str | None = None
    description_ru: str = ""
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

    def __init__(self, terms: list[SemanticLayerTerm], path: Path | None = None) -> None:
        self._terms = list(terms)
        self._path = path or _default_dictionary_path()
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
        return cls(terms, p)

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

    def create_public(self, payload: dict[str, Any]) -> DictionaryEntryResponse:
        term_key = self._normalize_term_key(payload.get("canonical_metric_key") or payload.get("term") or payload.get("id"))
        if self.get_public(term_key):
            raise ValueError(f"Dictionary entry '{term_key}' already exists")
        term = self._from_public_payload(payload, fallback_id=term_key)
        self._terms.append(term)
        self._reindex()
        self._save()
        return self._to_public(term)

    def update_public(self, entry_id: str, payload: dict[str, Any]) -> DictionaryEntryResponse:
        idx, current = self._find_term(entry_id)
        if current is None:
            raise KeyError("Unknown dictionary entry")
        merged = {
            "id": current.id,
            "term": payload.get("term", current.business_term),
            "synonyms": payload.get("synonyms", current.synonyms),
            "sql_expression": payload.get("sql_expression", current.sql_expression),
            "domain": payload.get("domain", current.domain),
            "canonical_metric_key": payload.get("canonical_metric_key", current.canonical_metric_key or current.id),
            "source_table": payload.get("source_table", current.source_table),
            "source_column": payload.get("source_column", current.source_column),
            "aggregation_type": payload.get("aggregation_type", current.aggregation_type),
            "term_type": payload.get("term_type", current.term_type),
            "target_field": payload.get("target_field", current.target_field),
            "filter_value": payload.get("filter_value", current.filter_value),
            "description_ru": payload.get("description_ru", current.description_ru),
            "constraints": payload.get("constraints", current.constraints),
            "example_queries": payload.get("example_queries", current.example_queries),
            "system_interpretation_ru": payload.get("system_interpretation_ru"),
        }
        next_term = self._from_public_payload(merged, fallback_id=current.id)
        self._terms[idx] = next_term
        self._reindex()
        self._save()
        return self._to_public(next_term)

    def delete_public(self, entry_id: str) -> None:
        idx, _ = self._find_term(entry_id)
        if idx is None:
            raise KeyError("Unknown dictionary entry")
        self._terms.pop(idx)
        self._reindex()
        self._save()

    def bootstrap_from_train(self) -> dict[str, int]:
        existing = {t.canonical_metric_key or t.id for t in self._terms}
        added = 0
        for item in _TRAIN_BOOTSTRAP_TERMS:
            key = str(item.get("canonical_metric_key") or item.get("id"))
            if key in existing:
                continue
            self._terms.append(self._from_public_payload(item, fallback_id=key))
            existing.add(key)
            added += 1
        if added:
            self._reindex()
            self._save()
        return {"added": added, "total": len(self._terms)}

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
            term_type=t.term_type,
            target_field=t.target_field,
            filter_value=t.filter_value,
            description_ru=t.description_ru,
            constraints=dict(t.constraints or {}),
            example_queries=list(t.example_queries or []),
            system_interpretation_ru=t.system_interpretation_ru(),
        )

    def _save(self) -> None:
        raw = [t.model_dump(mode="json") for t in self._terms]
        self._path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def _reindex(self) -> None:
        self._by_key = {}
        for t in self._terms:
            self._by_key[t.canonical_metric_key or t.id] = t

    def _find_term(self, entry_id: str) -> tuple[int | None, SemanticLayerTerm | None]:
        for idx, term in enumerate(self._terms):
            key = term.canonical_metric_key or term.id
            if entry_id in {term.id, key}:
                return idx, term
        return None, None

    def _from_public_payload(self, payload: dict[str, Any], *, fallback_id: str) -> SemanticLayerTerm:
        term_text = str(payload.get("term") or fallback_id).strip()
        canonical = self._normalize_term_key(payload.get("canonical_metric_key") or fallback_id)
        synonyms = [str(s).strip() for s in (payload.get("synonyms") or []) if str(s).strip()]
        system_ru = str(payload.get("system_interpretation_ru") or "").strip()
        constraints = dict(payload.get("constraints") or {})
        if system_ru and "notes" not in constraints:
            constraints["notes"] = system_ru
        constraints.setdefault("updated_at", datetime.now(timezone.utc).replace(microsecond=0).isoformat())
        return SemanticLayerTerm(
            id=self._normalize_term_key(payload.get("id") or canonical),
            domain=str(payload.get("domain") or "custom_train"),
            business_term=term_text,
            business_terms=[term_text],
            canonical_metric_key=canonical,
            synonyms=synonyms,
            source_table=str(payload.get("source_table") or "train"),
            source_column=payload.get("source_column"),
            aggregation_type=str(payload.get("aggregation_type") or "custom"),
            term_type=str(payload.get("term_type") or "metric"),
            target_field=(str(payload.get("target_field")).strip() if payload.get("target_field") else None),
            filter_value=(str(payload.get("filter_value")).strip() if payload.get("filter_value") else None),
            description_ru=str(payload.get("description_ru") or ""),
            sql_expression=str(payload.get("sql_expression") or "COUNT(*)"),
            constraints=constraints,
            example_queries=[str(x).strip() for x in (payload.get("example_queries") or []) if str(x).strip()],
            requires_join_campaigns=False,
            is_default=False,
            confidence=0.9,
        )

    def _normalize_term_key(self, value: Any) -> str:
        text = str(value or "").strip().lower()
        slug = re.sub(r"[^a-z0-9_]+", "_", text)
        slug = re.sub(r"_+", "_", slug).strip("_")
        return slug or f"custom_{len(self._terms) + 1}"

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

    def resolve_dimensions(self, query: str) -> list[str]:
        qn = _normalize_match_text(query)
        out: list[str] = []
        for t in self._terms:
            if t.term_type != "dimension" or not t.target_field:
                continue
            if any(pat in qn for pat in t.match_patterns()):
                if t.target_field not in out:
                    out.append(t.target_field)
        return out

    def resolve_filters(self, query: str) -> dict[str, str]:
        qn = _normalize_match_text(query)
        out: dict[str, str] = {}
        for t in self._terms:
            if t.term_type != "filter" or not t.target_field or not t.filter_value:
                continue
            if any(pat in qn for pat in t.match_patterns()):
                out.setdefault(t.target_field, t.filter_value)
        return out

    def metadata(self) -> dict[str, Any]:
        try:
            raw = self._path.read_bytes()
            version = hashlib.sha1(raw).hexdigest()[:12]
            updated_at = datetime.fromtimestamp(self._path.stat().st_mtime, tz=timezone.utc).replace(microsecond=0).isoformat()
        except OSError:
            version = "unknown"
            updated_at = None
        return {
            "version": version,
            "source": str(self._path),
            "term_count": len(self._terms),
            "updated_at": updated_at,
        }

    def primary_metric_sql(self, resolutions: list[SemanticTermResolution]) -> str:
        if not resolutions:
            return self.default_term().sql_expression
        return resolutions[0].sql_fragment

    def primary_source_table(self, resolutions: list[SemanticTermResolution]) -> str:
        """Таблица-источник для основной метрики (fallback: source_table дефолтного терма)."""
        if not resolutions:
            return self.default_term().source_table or "train"
        key = (resolutions[0].term_key or "").strip()
        if key and (term := self.get_by_metric_key(key)) is not None:
            return term.source_table or "train"
        return self.default_term().source_table or "train"

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
