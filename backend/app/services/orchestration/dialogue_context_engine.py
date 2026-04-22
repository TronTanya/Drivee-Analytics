"""Rules-first follow-up resolution using notebook context snapshots (LLM hook later)."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.schemas.dialogue_context import DialogueContextResult
from app.services.llm.llm_service import LLMService

_CONTINUATION_MARKERS: Tuple[str, ...] = (
    "а теперь",
    "а ",
    "теперь ",
    "добавь ",
    "добавить ",
    "сравни ",
    "только ",
    "ещё ",
    "еще ",
    "убери ",
    "без ",
    "и ",
    "к ",
    "сохрани ",
)


class DialogueContextEngine:
    """Detects follow-ups, merges inherited slots, emits rewritten NL + entity patches."""

    def __init__(self, llm_service: LLMService | None = None) -> None:
        self._llm = llm_service

    def resolve(self, preprocessed_query: str, notebook_context: Optional[dict[str, Any]]) -> DialogueContextResult:
        nb = dict(notebook_context or {})
        raw = preprocessed_query.strip()
        trace: List[str] = []

        base = (nb.get("last_rewritten_query") or nb.get("last_user_query") or "").strip()
        has_memory = bool(
            base
            or nb.get("base_metric")
            or nb.get("last_intent_kind")
            or (nb.get("dialogue_turn") or 0) > 0
        )
        is_followup = bool(has_memory and self._is_followup_shape(raw))

        resolved: Dict[str, Any] = {
            "active_filters": dict(nb.get("active_filters") or {}),
            "base_metric": nb.get("base_metric"),
            "last_intent_kind": nb.get("last_intent_kind"),
            "status_filters": list(nb.get("status_filters") or []),
        }
        entity_overrides: Dict[str, Any] = {}

        if not is_followup:
            trace.append("no_follow_up: fresh turn or missing prior snapshot")
            return DialogueContextResult(
                is_followup=False,
                resolved_context=resolved,
                rewritten_query_for_execution=raw,
                inheritance_trace=trace,
                entity_overrides=entity_overrides,
            )

        trace.append("follow_up_detected: notebook context has prior query or metric")
        q = raw.lower()
        rewritten = raw
        parts_suffix: List[str] = []

        city_match = re.search(r"(?:city[_\s-]?id|город)\s*[:=]?\s*(\d+)", q)
        if city_match:
            city_id = city_match.group(1)
            entity_overrides["city_id"] = city_id
            resolved["active_filters"]["city_id"] = city_id
            trace.append(f"patch: geo filter city_id={city_id}")

        if "добавь" in q and ("отмен" in q or "cancel" in q):
            parts_suffix.append("добавь метрику отмен заказов")
            trace.append("patch: additive metric focus → cancellations")

        if "прошл" in q and "недел" in q:
            entity_overrides["compare_baseline"] = "wow"
            resolved["compare_baseline"] = "wow"
            trace.append("patch: comparison baseline = previous week (wow)")

        if self._mentions_save_report(q):
            cadence = "weekly" if ("еженедельн" in q or "каждую недел" in q) else "adhoc"
            resolved["pending_action"] = {"type": "save_scenario", "cadence": cadence}
            trace.append(f"patch: dialogue action save_scenario cadence={cadence}")

        statuses = self._parse_status_constraints(q)
        if statuses:
            entity_overrides["status_order_in"] = statuses
            resolved["status_filters"] = statuses
            trace.append(f"patch: restrict status_order {statuses}")

        if parts_suffix:
            rewritten = self._compose(base, raw + " " + " ".join(parts_suffix))
        elif base:
            rewritten = self._compose(base, raw)
            trace.append("inherit: prepended last_rewritten_query / last_user_query")
        else:
            rewritten = raw
            trace.append("follow_up_without_stored_nl: using utterance only")

        resolved["rewritten_query_for_execution"] = rewritten
        resolved["source_user_query"] = raw
        resolved["prior_base_present"] = bool(base)

        if self._llm is not None and self._llm.is_enabled:
            llm_res = self._llm.rewrite_followup_query_with_context(
                query=raw,
                base_query=base,
                context=resolved,
            )
            if llm_res is not None and llm_res.is_followup and llm_res.rewritten_query.strip():
                rewritten = llm_res.rewritten_query.strip()
                resolved["rewritten_query_for_execution"] = rewritten
                if llm_res.used_context_fields:
                    resolved["llm_used_context_fields"] = llm_res.used_context_fields
                trace.append("llm_rewrite: follow-up query rewritten with context")

        return DialogueContextResult(
            is_followup=is_followup,
            resolved_context=resolved,
            rewritten_query_for_execution=rewritten,
            inheritance_trace=trace,
            entity_overrides=entity_overrides,
        )

    @staticmethod
    def _is_followup_shape(raw: str) -> bool:
        if len(raw) <= 96:
            return True
        low = raw.strip().lower()
        return any(low.startswith(m.strip()) for m in _CONTINUATION_MARKERS)

    @staticmethod
    def _compose(base: str, addition: str) -> str:
        b = base.rstrip().rstrip(".")
        a = addition.strip()
        if not b:
            return a
        if not a:
            return b
        return f"{b}. {a}"

    @staticmethod
    def _mentions_save_report(q: str) -> bool:
        return "сохрани" in q and ("отчет" in q or "отчёт" in q or "report" in q)

    @staticmethod
    def _parse_status_constraints(q: str) -> List[str]:
        out: List[str] = []
        if "отмен" in q or "cancel" in q:
            out.append("cancelled")
        if "заверш" in q or "done" in q:
            out.append("done")
        dedup: List[str] = []
        for c in out:
            if c not in dedup:
                dedup.append(c)
        return dedup
