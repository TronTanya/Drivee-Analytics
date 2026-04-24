from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_current_active_user, require_capability
from app.core.config import settings
from app.models.user import User
from app.schemas.dictionary_terms import DictionaryBootstrapResponse, DictionaryEntryResponse, DictionaryEntryUpsertRequest
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


@router.post("/entries", response_model=DictionaryEntryResponse)
def create_dictionary_entry(
    body: DictionaryEntryUpsertRequest,
    user: User = Depends(require_capability("edit_dictionary")),
) -> DictionaryEntryResponse:
    del user
    try:
        row = get_semantic_dictionary_store().create_public(body.model_dump(mode="json"))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    _dictionary_list_cache().clear()
    get_semantic_dictionary_store.cache_clear()
    return row


@router.patch("/entries/{entry_id}", response_model=DictionaryEntryResponse)
def patch_dictionary_entry(
    entry_id: str,
    body: DictionaryEntryUpsertRequest,
    user: User = Depends(require_capability("edit_dictionary")),
) -> DictionaryEntryResponse:
    del user
    try:
        row = get_semantic_dictionary_store().update_public(entry_id, body.model_dump(mode="json"))
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    _dictionary_list_cache().clear()
    get_semantic_dictionary_store.cache_clear()
    return row


@router.delete("/entries/{entry_id}", response_model=dict[str, str])
def delete_dictionary_entry(
    entry_id: str,
    user: User = Depends(require_capability("edit_dictionary")),
) -> dict[str, str]:
    del user
    try:
        get_semantic_dictionary_store().delete_public(entry_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    _dictionary_list_cache().clear()
    get_semantic_dictionary_store.cache_clear()
    return {"status": "deleted"}


@router.post("/entries/bootstrap-train", response_model=DictionaryBootstrapResponse)
def bootstrap_dictionary_from_train(
    user: User = Depends(require_capability("edit_dictionary")),
) -> DictionaryBootstrapResponse:
    del user
    stats = get_semantic_dictionary_store().bootstrap_from_train()
    _dictionary_list_cache().clear()
    get_semantic_dictionary_store.cache_clear()
    return DictionaryBootstrapResponse(**stats)
