"""Single-process orchestration for notebook cell execution (steps 1–14)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional
import re

import numpy as np
from sqlalchemy.orm import Session
import pandas as pd

from app.schemas.clarification import ClarificationResponse
from app.schemas.orchestration import (
    AmbiguityPayload,
    ChartRecommendation,
    OrchestrationInput,
    OrchestrationOutput,
    PipelineStepTrace,
)
from app.schemas.visualization import VisualizationRecommendation
from app.core.config import settings
from app.services.orchestration.chart_recommendation_service import ChartRecommendationService
from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.dialogue_context_engine import DialogueContextEngine
from app.services.orchestration.explainability_service import ExplainabilityService
from app.services.orchestration.insight_generation_service import InsightGenerationService
from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.persistence import PersistenceCallable
from app.services.orchestration.semantic_service import SemanticService
from app.services.correction_learning_service import AppliedCorrectionMatch, CorrectionLearningService
from app.services.orchestration.sql_execution_service import ExecutionResult, SQLExecutionService
from app.services.orchestration.sql_generation_service import SQLGenerationService
from app.services.llm.factory import get_llm_service


def _step(name: str, ok: bool, **detail: Any) -> PipelineStepTrace:
    return PipelineStepTrace(name=name, ok=ok, detail=detail or {})


def _nondefault_semantic_count(resolutions: list[Any]) -> int:
    return sum(1 for r in resolutions if getattr(r, "surface_form", "") != "default")


def _ambiguity_from_clarification(clar: ClarificationResponse) -> AmbiguityPayload:
    if not clar.clarification_required:
        return AmbiguityPayload()
    return AmbiguityPayload(
        required=True,
        question=clar.clarification_question,
        options=[o.value for o in clar.clarification_options],
        reason=clar.clarification_reason,
    )


def _chart_from_visualization(viz: VisualizationRecommendation) -> ChartRecommendation:
    explanation = viz.visualization_explanation or viz.recommendation_reason
    return ChartRecommendation(
        chart_type=viz.recommended_chart_type,
        rationale=explanation,
        alternatives=viz.alternative_chart_types,
    )


def _forecast_from_rows(rows: list[dict[str, Any]], horizon_steps: int = 4) -> list[dict[str, Any]]:
    if len(rows) < 2:
        return []
    df = pd.DataFrame(rows)

    # Prefer canonical "value", but gracefully fall back to the first numeric metric column.
    target_col: Optional[str] = None
    if "value" in df.columns:
        target_col = "value"
    else:
        for c in df.columns:
            if pd.api.types.is_numeric_dtype(df[c]):
                target_col = c
                break
        if target_col is None:
            for c in df.columns:
                coerced = pd.to_numeric(df[c], errors="coerce")
                if coerced.notna().sum() >= max(2, int(len(df) * 0.5)):
                    df[c] = coerced
                    target_col = c
                    break

    if target_col is None:
        return []

    y = df[target_col].astype(float).to_numpy()
    x = np.arange(len(y))
    slope, intercept = np.polyfit(x, y, 1)
    horizon = max(1, min(90, int(horizon_steps)))
    out = []
    for i in range(horizon):
        step = len(y) + i
        pred = float(slope * step + intercept)
        out.append({"step": i + 1, "forecast_value": round(pred, 2)})
    return out


def _resolve_forecast_horizon(entities: dict[str, Any]) -> int:
    raw = entities.get("forecast_horizon_steps")
    try:
        if raw is None:
            return 4
        value = int(raw)
    except (TypeError, ValueError):
        return 4
    return max(1, min(90, value))


def _normalize_dimension_labels(rows: list[dict[str, Any]], columns: list[str]) -> list[dict[str, Any]]:
    """Normalize low-level identifiers into user-facing dimension labels."""
    if not rows:
        return rows
    target_keys = [k for k in ("dim", "city_id") if k in columns]
    if not target_keys:
        return rows

    out: list[dict[str, Any]] = []
    for row in rows:
        current = dict(row)
        for key in target_keys:
            raw = current.get(key)
            if raw is None:
                continue
            text = str(raw).strip()
            if not text:
                continue
            # Canonical dataset may store city as numeric id; make it explicit in UI.
            if re.fullmatch(r"\d+", text):
                current[key] = settings.city_id_label_map.get(text, f"Город #{text}")
        out.append(current)
    return out


class QueryOrchestrator:
    def __init__(
        self,
        intent_service: Optional[IntentService] = None,
        semantic_service: Optional[SemanticService] = None,
        sql_generation: Optional[SQLGenerationService] = None,
        sql_execution: Optional[SQLExecutionService] = None,
        persistence: Optional[PersistenceCallable] = None,
        clarification_engine: Optional[ClarificationEngine] = None,
        dialogue_engine: Optional[DialogueContextEngine] = None,
        chart_recommendation: Optional[ChartRecommendationService] = None,
        correction_learning: Optional[CorrectionLearningService] = None,
        explainability_service: Optional[ExplainabilityService] = None,
        insight_service: Optional[InsightGenerationService] = None,
    ) -> None:
        llm_service = get_llm_service()
        self._intent = intent_service or IntentService(llm_service=llm_service)
        self._semantic = semantic_service or SemanticService()
        self._sql_gen = sql_generation or SQLGenerationService()
        self._sql_exec = sql_execution or SQLExecutionService()
        self._persistence = persistence
        self._clarification = clarification_engine or ClarificationEngine(llm_service=llm_service)
        self._dialogue = dialogue_engine or DialogueContextEngine(llm_service=llm_service)
        self._charts = chart_recommendation or ChartRecommendationService()
        self._correction_learning = correction_learning
        self._explainability = explainability_service or ExplainabilityService(llm_service=llm_service)
        self._insight_service = insight_service or InsightGenerationService(llm_service=llm_service)
        self._llm_provider_name = llm_service.provider_name
        self._llm_enabled = llm_service.is_enabled

    def run(
        self,
        inp: OrchestrationInput,
        *,
        persistence_context: Any = None,
    ) -> OrchestrationOutput:
        steps: list[PipelineStepTrace] = []
        started = datetime.utcnow()

        raw = self._intent.preprocess_query(inp.raw_query)
        steps.append(_step("preprocess_query", True, length=len(raw)))
        steps.append(_step("llm_intelligence_layer", True, enabled=self._llm_enabled, provider=self._llm_provider_name))

        dialogue_res = self._dialogue.resolve(raw, inp.notebook_context)
        effective = dialogue_res.rewritten_query_for_execution
        is_follow_up = dialogue_res.is_followup
        steps.append(
            _step(
                "dialogue_context",
                True,
                is_followup=dialogue_res.is_followup,
                inheritance_trace=dialogue_res.inheritance_trace,
                dialogue=dialogue_res.to_api_dict(),
            )
        )

        intent_res = self._intent.classify_intent(effective)
        entities = self._intent.extract_entities(effective)
        for key, val in (inp.notebook_context.get("active_filters") or {}).items():
            if key == "city_id" and val and "city_id" not in entities:
                entities["city_id"] = val
            if key == "status_order" and val and "status_order" not in entities:
                entities["status_order"] = val
        entities.update(dialogue_res.entity_overrides)
        steps.append(
            _step(
                "classify_intent",
                True,
                intent=intent_res.intent,
                signals=intent_res.signals,
            )
        )
        steps.append(_step("extract_entities", True, entities=entities))

        resolutions = self._semantic.resolve(effective)
        steps.append(
            _step(
                "resolve_semantic_terms",
                True,
                terms=[r.model_dump() for r in resolutions],
            )
        )

        nd_semantic = _nondefault_semantic_count(resolutions)
        clar = self._clarification.evaluate(
            ClarificationContext(
                effective_query=effective,
                intent=intent_res.intent,
                entities=entities,
                resolutions=resolutions,
                nondefault_semantic_count=nd_semantic,
                intent_signals=intent_res.signals,
            )
        )
        ambiguity = _ambiguity_from_clarification(clar)
        steps.append(
            _step(
                "clarification_engine",
                not clar.clarification_required,
                required=clar.clarification_required,
                reason=clar.clarification_reason,
            )
        )

        conf = self._clarification.score_confidence(resolutions, intent_res.signals, clar)
        steps.append(_step("compute_confidence_score", True, score=conf))

        if clar.clarification_required:
            trace = clar.to_trace_dict(conf)
            explainability_text = self._explainability.generate(
                query=effective,
                intent=intent_res.intent,
                entities=entities,
                clarification_required=True,
            )
            steps.append(_step("awaiting_user_clarification", True, options=len(clar.clarification_options)))
            out = OrchestrationOutput(
                preprocessed_query=raw,
                effective_query=effective,
                is_follow_up=is_follow_up,
                intent=intent_res.intent,
                entities=entities,
                semantic_resolutions=resolutions,
                ambiguity=ambiguity,
                confidence_score=conf,
                generated_sql="",
                validated_sql="",
                validation_warnings=[],
                execution_status="clarification_required",
                insight_text=clar.clarification_question,
                trace_payload={
                    "intent": intent_res.intent,
                    "pipeline_steps": [s.model_dump() for s in steps],
                    "explainability_text": explainability_text,
                    "clarification": trace,
                    "ambiguity": ambiguity.model_dump(),
                    "rules_engine_version": "mvp-1",
                    "dialogue": dialogue_res.to_api_dict(),
                    "inheritance_trace": dialogue_res.inheritance_trace,
                    "effective_query": effective,
                    "entities": entities,
                    "semantic_terms": [r.model_dump() for r in resolutions],
                    "forecast_mode": {"active": False, "method": None},
                },
                pipeline_steps=steps,
                started_at=started,
                finished_at=datetime.utcnow(),
                clarification=clar,
                dialogue=dialogue_res,
            )
            self._call_persistence(out, persistence_context)
            return out

        metric_sql = self._semantic.primary_metric_sql(resolutions)
        use_campaigns = self._semantic.needs_marketing_join(effective)

        base_sql_source = "semantic_mapping" if nd_semantic > 0 else "default_template"
        template_sql = self._sql_gen.generate(
            intent_res.intent,
            entities,
            metric_sql,
            use_campaigns_only=use_campaigns,
            workspace_id=inp.workspace_id,
        )
        draft_sql = template_sql
        sql_generation_source: str = base_sql_source
        applied_correction_id: Optional[uuid.UUID] = None
        correction_similarity: Optional[float] = None
        correction_match_kind: Optional[str] = None
        correction_match: Optional[AppliedCorrectionMatch] = None

        if self._correction_learning and inp.workspace_id:
            try:
                ws_uuid = uuid.UUID(str(inp.workspace_id))
            except ValueError:
                ws_uuid = None
            if ws_uuid is not None:
                correction_match = self._correction_learning.try_apply(ws_uuid, effective, template_sql)
                if correction_match is not None:
                    draft_sql = correction_match.corrected_sql
                    sql_generation_source = "learned_correction"
                    applied_correction_id = correction_match.correction_id
                    correction_similarity = correction_match.similarity
                    correction_match_kind = correction_match.match_kind

        sql_generation_trace = {
            "source": sql_generation_source,
            "base_source": base_sql_source,
            "applied_correction_id": str(applied_correction_id) if applied_correction_id else None,
            "correction_similarity": correction_similarity,
            "correction_match_kind": correction_match_kind,
        }
        steps.append(
            _step(
                "correction_learning",
                True,
                applied=correction_match is not None,
                sql_generation=sql_generation_trace,
            )
        )
        steps.append(_step("generate_sql", True, sql_preview=draft_sql[:500]))

        vres = self._sql_exec.validate(draft_sql, role_key=inp.role_key)
        validation_warnings = list(vres.warnings)
        steps.append(_step("validate_sql", vres.is_valid, validation=vres.model_dump()))
        if not vres.is_valid:
            vmsg = "; ".join(vres.errors) if vres.errors else "Validation failed"
            explainability_text = self._explainability.generate(
                query=effective,
                intent=intent_res.intent,
                entities=entities,
                clarification_required=False,
            )
            out = OrchestrationOutput(
                preprocessed_query=raw,
                effective_query=effective,
                is_follow_up=is_follow_up,
                intent=intent_res.intent,
                entities=entities,
                semantic_resolutions=resolutions,
                ambiguity=ambiguity,
                confidence_score=conf * 0.5,
                sql_generation_source=sql_generation_source,
                applied_correction_id=applied_correction_id,
                correction_similarity=correction_similarity,
                correction_match_kind=correction_match_kind,
                generated_sql=draft_sql,
                validated_sql="",
                validation_warnings=validation_warnings + list(vres.errors),
                execution_status="failed",
                insight_text=f"SQL не прошёл проверку: {vmsg}",
                trace_payload={
                    "intent": intent_res.intent,
                    "pipeline_steps": [s.model_dump() for s in steps],
                    "explainability_text": explainability_text,
                    "sql_validation": vres.model_dump(),
                    "clarification": {**clar.model_dump(), "confidence_score": conf * 0.5},
                    "dialogue": dialogue_res.to_api_dict(),
                    "inheritance_trace": dialogue_res.inheritance_trace,
                    "effective_query": effective,
                    "entities": entities,
                    "semantic_terms": [r.model_dump() for r in resolutions],
                    "sql_generation": sql_generation_trace,
                    "forecast_mode": {"active": False, "method": None},
                },
                pipeline_steps=steps,
                started_at=started,
                finished_at=datetime.utcnow(),
                sql_validation=vres,
                clarification=clar,
                dialogue=dialogue_res,
            )
            self._call_persistence(out, persistence_context)
            return out

        exec_res: ExecutionResult = self._sql_exec.execute(validation=vres)

        if not exec_res.ok:
            steps.append(_step("execute_sql", False, error=exec_res.error))
            explainability_text = self._explainability.generate(
                query=effective,
                intent=intent_res.intent,
                entities=entities,
                clarification_required=False,
            )
            out = OrchestrationOutput(
                preprocessed_query=raw,
                effective_query=effective,
                is_follow_up=is_follow_up,
                intent=intent_res.intent,
                entities=entities,
                semantic_resolutions=resolutions,
                ambiguity=ambiguity,
                confidence_score=conf * 0.5,
                sql_generation_source=sql_generation_source,
                applied_correction_id=applied_correction_id,
                correction_similarity=correction_similarity,
                correction_match_kind=correction_match_kind,
                generated_sql=draft_sql,
                validated_sql=exec_res.final_sql,
                validation_warnings=list(exec_res.validation_warnings),
                execution_status="failed",
                insight_text=f"Ошибка выполнения: {exec_res.error}",
                trace_payload={
                    "intent": intent_res.intent,
                    "pipeline_steps": [s.model_dump() for s in steps],
                    "explainability_text": explainability_text,
                    "sql_validation": exec_res.sql_validation.model_dump() if exec_res.sql_validation else {},
                    "clarification": {**clar.model_dump(), "confidence_score": conf * 0.5},
                    "dialogue": dialogue_res.to_api_dict(),
                    "inheritance_trace": dialogue_res.inheritance_trace,
                    "effective_query": effective,
                    "entities": entities,
                    "semantic_terms": [r.model_dump() for r in resolutions],
                    "sql_generation": sql_generation_trace,
                    "forecast_mode": {"active": False, "method": None},
                },
                pipeline_steps=steps,
                started_at=started,
                finished_at=datetime.utcnow(),
                sql_validation=exec_res.sql_validation,
                clarification=clar,
                dialogue=dialogue_res,
            )
            self._call_persistence(out, persistence_context)
            return out

        steps.append(_step("execute_sql", True, rows=exec_res.rowcount))

        normalized_rows = _normalize_dimension_labels(exec_res.rows, exec_res.columns)
        if normalized_rows is not exec_res.rows:
            exec_res = ExecutionResult(
                ok=exec_res.ok,
                rows=normalized_rows,
                columns=exec_res.columns,
                rowcount=exec_res.rowcount,
                error=exec_res.error,
                normalized_sql=exec_res.normalized_sql,
                final_sql=exec_res.final_sql,
                validation_warnings=exec_res.validation_warnings,
                sql_validation=exec_res.sql_validation,
            )
            steps.append(_step("normalize_dimensions", True, keys=["dim", "city_id"]))

        viz = self._charts.recommend(
            intent_res.intent,
            exec_res.columns,
            exec_res.rows,
            effective_query=effective,
        )
        chart = _chart_from_visualization(viz)
        steps.append(
            _step(
                "recommend_chart_type",
                True,
                chart=viz.recommended_chart_type,
                visualization_confidence=viz.visualization_confidence,
            )
        )

        insight = self._insight_service.generate(intent_res.intent, exec_res.rows, exec_res.columns)
        steps.append(_step("generate_insight", True))

        forecast_records: list[dict[str, Any]] = []
        if intent_res.intent == "forecast" or "прогноз" in effective.lower():
            horizon_steps = _resolve_forecast_horizon(entities)
            forecast_records = _forecast_from_rows(exec_res.rows, horizon_steps=horizon_steps)
            steps.append(_step("forecast_sidecar", True, points=len(forecast_records)))

        forecast_active = bool(forecast_records) or intent_res.intent == "forecast"
        forecast_method: Optional[str] = "linear_trend_ols" if forecast_records else None

        steps.append(_step("build_trace_payload", True))
        steps.append(_step("persist_results", True, hook=bool(self._persistence)))
        explainability_text = self._explainability.generate(
            query=effective,
            intent=intent_res.intent,
            entities=entities,
            clarification_required=False,
        )

        trace_payload = {
            "intent": intent_res.intent,
            "entities": entities,
            "semantic_terms": [r.model_dump() for r in resolutions],
            "sql": {"draft": draft_sql, "final": exec_res.final_sql},
            "sql_generation": sql_generation_trace,
            "execution": {"rows": exec_res.rowcount, "columns": exec_res.columns},
            "ambiguity": ambiguity.model_dump(),
            "chart": chart.model_dump(),
            "visualization": viz.model_dump(),
            "pipeline_steps": [s.model_dump() for s in steps],
            "rules_engine_version": "mvp-1",
            "sql_validation": vres.model_dump(),
            "explainability_text": explainability_text,
            "clarification": {**clar.model_dump(), "confidence_score": conf},
            "dialogue": dialogue_res.to_api_dict(),
            "inheritance_trace": dialogue_res.inheritance_trace,
            "effective_query": effective,
            "forecast_mode": {"active": forecast_active, "method": forecast_method},
        }

        out = OrchestrationOutput(
            preprocessed_query=raw,
            effective_query=effective,
            is_follow_up=is_follow_up,
            intent=intent_res.intent,
            entities=entities,
            semantic_resolutions=resolutions,
            ambiguity=ambiguity,
            confidence_score=conf,
            sql_generation_source=sql_generation_source,
            applied_correction_id=applied_correction_id,
            correction_similarity=correction_similarity,
            correction_match_kind=correction_match_kind,
            generated_sql=draft_sql,
            validated_sql=exec_res.final_sql,
            validation_warnings=list(exec_res.validation_warnings),
            execution_status="succeeded",
            rows_returned=exec_res.rowcount,
            result_preview=exec_res.rows[:100],
            result_columns=exec_res.columns,
            chart=chart,
            insight_text=insight,
            forecast_records=forecast_records,
            trace_payload=trace_payload,
            pipeline_steps=steps,
            started_at=started,
            finished_at=datetime.utcnow(),
            sql_validation=vres,
            clarification=clar,
            dialogue=dialogue_res,
            visualization=viz,
        )
        self._call_persistence(out, persistence_context)
        return out

    def _call_persistence(self, output: OrchestrationOutput, ctx: Any) -> None:
        if self._persistence is None or ctx is None:
            return
        self._persistence(output, ctx)


def build_default_orchestrator(
    persistence: Optional[PersistenceCallable] = None,
) -> QueryOrchestrator:
    return QueryOrchestrator(persistence=persistence)


def build_orchestrator_with_learning(
    session: Session,
    persistence: Optional[PersistenceCallable] = None,
) -> QueryOrchestrator:
    """Orchestrator with workspace-scoped correction reuse (requires DB session)."""
    from app.repositories.query_correction_repository import QueryCorrectionRepository

    repo = QueryCorrectionRepository(session)
    learning = CorrectionLearningService(repo)
    return QueryOrchestrator(persistence=persistence, correction_learning=learning)
