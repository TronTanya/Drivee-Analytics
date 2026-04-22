"""Similarity-based reuse of admin-recorded SQL corrections (per workspace)."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from app.models.query_correction import QueryCorrection
from app.repositories.query_correction_repository import QueryCorrectionRepository

_TOKEN_RE = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)


def normalize_query_text(q: str) -> str:
    return " ".join(q.strip().lower().split())


def normalize_sql_fingerprint(sql: str) -> str:
    return " ".join(sql.strip().lower().split())


def _tokens(s: str) -> set[str]:
    return set(_TOKEN_RE.findall(s.lower()))


def jaccard(a: set[str], b: set[str]) -> float:
    if not a and not b:
        return 1.0
    u = a | b
    if not u:
        return 0.0
    return len(a & b) / len(u)


@dataclass
class AppliedCorrectionMatch:
    correction_id: uuid.UUID
    corrected_sql: str
    similarity: float
    match_kind: str  # exact_normalized | similarity


class CorrectionLearningService:
    """
    - Exact match on normalized NL beats fuzzy.
    - Fuzzy: token Jaccard on NL; optional boost if generated SQL fingerprint is close to stored template.
    """

    def __init__(
        self,
        repository: QueryCorrectionRepository,
        *,
        min_query_similarity: float = 0.52,
        min_query_with_sql_boost: float = 0.42,
        min_sql_fingerprint_jaccard: float = 0.55,
    ) -> None:
        self._repo = repository
        self._min_q = min_query_similarity
        self._min_q_boost = min_query_with_sql_boost
        self._min_sql = min_sql_fingerprint_jaccard

    def try_apply(
        self,
        workspace_id: uuid.UUID,
        effective_query: str,
        generated_sql: str,
    ) -> Optional[AppliedCorrectionMatch]:
        rows = self._repo.list_for_workspace(workspace_id)
        if not rows:
            return None

        nq = normalize_query_text(effective_query)
        g_fp = normalize_sql_fingerprint(generated_sql)
        q_tok = _tokens(nq)
        g_tok = _tokens(g_fp)

        exact: Optional[AppliedCorrectionMatch] = None
        best_fuzzy: Optional[AppliedCorrectionMatch] = None
        best_score = 0.0

        for row in rows:
            rn = row.query_normalized
            if rn == nq:
                exact = AppliedCorrectionMatch(
                    correction_id=row.id,
                    corrected_sql=row.corrected_sql,
                    similarity=1.0,
                    match_kind="exact_normalized",
                )
                break

            q_sim = jaccard(q_tok, _tokens(rn))
            sql_sim = jaccard(g_tok, _tokens(normalize_sql_fingerprint(row.generated_sql)))

            score = q_sim
            if sql_sim >= self._min_sql and q_sim >= self._min_q_boost:
                score = max(score, (q_sim + sql_sim) / 2)

            if score >= self._min_q and score > best_score:
                best_score = score
                best_fuzzy = AppliedCorrectionMatch(
                    correction_id=row.id,
                    corrected_sql=row.corrected_sql,
                    similarity=round(score, 3),
                    match_kind="similarity",
                )

        return exact or best_fuzzy

    def persist_correction(
        self,
        *,
        workspace_id: uuid.UUID,
        original_query: str,
        generated_sql: str,
        corrected_sql: str,
        correction_type: str,
        semantic_terms_before: List[str],
        semantic_terms_after: List[str],
        created_by: uuid.UUID,
        notes: Optional[str] = None,
    ) -> QueryCorrection:
        row = QueryCorrection(
            workspace_id=workspace_id,
            original_query=original_query.strip(),
            query_normalized=normalize_query_text(original_query),
            generated_sql=generated_sql.strip(),
            corrected_sql=corrected_sql.strip(),
            correction_type=correction_type,
            semantic_terms_before=semantic_terms_before,
            semantic_terms_after=semantic_terms_after,
            created_by=created_by,
            notes=notes,
        )
        return self._repo.create(row)
