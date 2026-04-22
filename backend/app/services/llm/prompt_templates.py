"""Central prompt template registry for LLM intelligence tasks."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Literal

from app.services.llm.sanitization import sanitize_prompt_text

PromptTask = Literal[
    "query_interpretation",
    "clarification_generation",
    "followup_rewrite",
    "explainability_text",
    "insight_generation",
]


@dataclass(frozen=True)
class PromptTemplate:
    system_prompt: str
    user_prompt: str


def _json_instruction(schema_example: dict[str, Any]) -> str:
    return (
        "Return only valid JSON. No markdown, no prose, no explanations.\n"
        f"JSON schema example:\n{json.dumps(schema_example, ensure_ascii=False)}"
    )


def build_prompt(task: PromptTask, payload: dict[str, Any]) -> PromptTemplate:
    if task == "query_interpretation":
        example = {
            "intent": "comparison",
            "metrics": ["client_cancellations"],
            "dimensions": ["city_id"],
            "filters": ["last_week"],
            "time_period": "last_week",
            "ambiguities": [],
            "confidence": 0.84,
        }
        return PromptTemplate(
            system_prompt=(
                "You classify business analytics NL queries for an NL->SQL orchestrator. "
                "Be conservative, avoid hallucinations, use only provided query."
            ),
            user_prompt=(
                f"User query: {sanitize_prompt_text(str(payload.get('query', '')))}\n"
                + _json_instruction(example)
            ),
        )

    if task == "clarification_generation":
        example = {
            "clarification_required": True,
            "clarification_question": "Уточните, по какой метрике сравнить city_id?",
            "clarification_options": [
                {"label": "Количество заказов", "value": "orders_count"},
                {"label": "Количество отмен клиентом", "value": "client_cancellations"},
                {"label": "Средняя стоимость заказа", "value": "avg_order_price"},
            ],
        }
        return PromptTemplate(
            system_prompt=(
                "You detect ambiguity in analytics questions and propose concise clarification. "
                "Do not invent hidden data."
            ),
            user_prompt=(
                f"User query: {sanitize_prompt_text(str(payload.get('query', '')))}\n"
                f"Intent: {payload.get('intent', '')}\n"
                f"Extracted entities: {json.dumps(payload.get('entities', {}), ensure_ascii=False)}\n"
                f"Semantic terms: {json.dumps(payload.get('semantic_terms', []), ensure_ascii=False)}\n"
                + _json_instruction(example)
            ),
        )

    if task == "followup_rewrite":
        example = {
            "is_followup": True,
            "rewritten_query": "Покажи отмены по city_id за вчера",
            "used_context_fields": ["metric", "date", "dimension"],
        }
        return PromptTemplate(
            system_prompt=(
                "You rewrite short follow-up analytics questions into standalone user queries "
                "using only provided context."
            ),
            user_prompt=(
                f"Current query: {sanitize_prompt_text(str(payload.get('query', '')))}\n"
                f"Previous query/context: {sanitize_prompt_text(str(payload.get('base_query', '')))}\n"
                f"Context slots: {json.dumps(payload.get('context', {}), ensure_ascii=False)}\n"
                + _json_instruction(example)
            ),
        )

    if task == "explainability_text":
        example = {
            "explanation_text": (
                "Система определила, что пользователь хочет сравнить количество отмен по city_id "
                "за прошлую неделю."
            )
        }
        return PromptTemplate(
            system_prompt=(
                "You generate a short explainability sentence for analytics query interpretation. "
                "Stay factual and concise."
            ),
            user_prompt=(
                f"Query: {sanitize_prompt_text(str(payload.get('query', '')))}\n"
                f"Intent: {payload.get('intent', '')}\n"
                f"Entities: {json.dumps(payload.get('entities', {}), ensure_ascii=False)}\n"
                f"Clarification required: {bool(payload.get('clarification_required', False))}\n"
                + _json_instruction(example)
            ),
        )

    if task == "insight_generation":
        example = {
            "insight_title": "Рост отмен в отдельных городах",
            "insight_text": "За прошлую неделю доля отмен выросла в части city_id относительно среднего уровня.",
        }
        rows = payload.get("rows", [])
        trimmed_rows = rows[:5] if isinstance(rows, list) else []
        return PromptTemplate(
            system_prompt=(
                "You summarize tabular analytics result rows into one short business insight. "
                "Use only provided rows. If data is weak, stay neutral."
            ),
            user_prompt=(
                f"Intent: {payload.get('intent', '')}\n"
                f"Columns: {json.dumps(payload.get('columns', []), ensure_ascii=False)}\n"
                f"Rows sample: {json.dumps(trimmed_rows, ensure_ascii=False, default=str)}\n"
                + _json_instruction(example)
            ),
        )

    raise ValueError(f"Unknown prompt task: {task}")
