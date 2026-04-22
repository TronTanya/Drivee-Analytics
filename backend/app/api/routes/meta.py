from fastapi import APIRouter

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/dictionary")
def dictionary() -> dict[str, list[dict[str, str]]]:
    return {"items": [{"term": "GMV", "definition": "Gross Merchandise Value"}]}
