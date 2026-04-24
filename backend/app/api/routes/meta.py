from fastapi import APIRouter
from app.schemas.dictionary_terms import DictionaryMetaResponse
from app.services.semantic_layer.store import get_semantic_dictionary_store

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/dictionary")
def dictionary() -> DictionaryMetaResponse:
    meta = get_semantic_dictionary_store().metadata()
    return DictionaryMetaResponse(**meta)
