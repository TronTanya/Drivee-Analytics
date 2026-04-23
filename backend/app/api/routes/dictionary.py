from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.schemas.dictionary_terms import DictionaryEntryResponse
from app.services.cache.ttl_cache import TTLCache
from app.services.semantic_layer.store import get_semantic_dictionary_store

router = APIRouter(prefix="/dictionary", tags=["dictionary"])

_dict_list_cache: TTLCache[list[dict[str, Any]]] | None = None


def _dictionary_list_cache() -> TTLCache[list[dict[str, Any]]]:
    global _dict_list_cache
    if _dict_list_cache is None:
        _dict_list_cache = TTLCache(
            maxsize=64,
            ttl_seconds=float(settings.dictionary_api_cache_ttl_seconds),
        )
    return _dict_list_cache


@router.get("/entries", response_model=list[DictionaryEntryResponse])
def list_dictionary_entries(
    q: str | None = Query(None, description="Поиск по термину, синониму или каноническому ключу"),
) -> list[DictionaryEntryResponse]:
    key = (q or "").strip().lower() or "__all__"
    hit = _dictionary_list_cache().get(key)
    if hit is not None:
        return [DictionaryEntryResponse.model_validate(x) for x in hit]
    rows = get_semantic_dictionary_store().list_public(query=q)
    _dictionary_list_cache().set(key, [r.model_dump(mode="json") for r in rows])
    return rows


@router.get("/entries/{entry_id}", response_model=DictionaryEntryResponse)
def get_dictionary_entry(entry_id: str) -> DictionaryEntryResponse:
    row = get_semantic_dictionary_store().get_public(entry_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown dictionary entry")
    return row


@router.post("/entries", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def create_dictionary_entry() -> dict[str, str]:
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Семантический словарь в MVP задаётся файлом app/data/semantic_dictionary.json",
    )


@router.patch("/entries/{entry_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def patch_dictionary_entry(entry_id: str) -> dict[str, str]:  # noqa: ARG001
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Семантический словарь в MVP задаётся файлом app/data/semantic_dictionary.json",
    )


@router.delete("/entries/{entry_id}", status_code=status.HTTP_501_NOT_IMPLEMENTED)
def delete_dictionary_entry(entry_id: str) -> dict[str, str]:  # noqa: ARG001
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Семантический словарь в MVP задаётся файлом app/data/semantic_dictionary.json",
    )
