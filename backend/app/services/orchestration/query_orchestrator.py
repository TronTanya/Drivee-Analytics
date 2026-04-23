"""Single-process orchestration for notebook cell execution (steps 1–14)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

import numpy as np
from sqlalchemy.orm import Session
import pandas as pd

from app.schemas.clarification import ClarificationResponse
from app.schemas.nl_interpretation import NLQueryInterpretation
from app.schemas.orchestration import (
    AmbiguityPayload,
    ChartRecommendation,
    OrchestrationInput,
    OrchestrationOutput,
    PipelineStepTrace,
)
from app.schemas.visualization import VisualizationRecommendation
from app.core.config import settings
from app.services.guardrails.audit import log_query_audit_event
from app.services.guardrails.policy_engine import (
    check_prompt_abuse,
    check_rate_limit,
    evaluate_canonical_metric_for_role,
)
from app.services.orchestration.chart_recommendation_service import ChartRecommendationService
from app.services.orchestration.clarification_engine import ClarificationContext, ClarificationEngine
from app.services.orchestration.dialogue_context_engine import DialogueContextEngine
from app.services.orchestration.explainability_service import ExplainabilityService
from app.services.orchestration.insight_generation_service import InsightGenerationService
from app.services.orchestration.intent_service import IntentService
from app.services.orchestration.persistence import PersistenceCallable
from app.services.orchestration.semantic_parser import SemanticParser
from app.services.orchestration.semantic_service import SemanticService
from app.services.cache.query_result_cache import (
    CachedSqlResult,
    make_nl_sql_cache_key,
    store_cached_sql_result,
    try_get_cached_sql_result,
)
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


def _audit_emit(inp: OrchestrationInput, out: OrchestrationOutput) -> None:
    tp = dict(out.trace_payload or {})
    gv = tp.get("guardrails")
    blocked = isinstance(gv, dict) and bool(gv.get("blocked"))
    if out.execution_status == "clarification_required":
        evt = "nl_query_clarification"
    elif blocked:
        evt = "nl_query_guardrails_block"
    elif out.execution_status == "failed":
        evt = "nl_query_failed"
    elif out.execution_status == "succeeded":
        evt = "nl_query_succeeded"
    else:
        evt = "nl_query_completed"
    sv = out.sql_validation
    canon = str((out.entities or {}).get("canonical_metric_key") or "").strip() or None
    br: Optional[str] = None
    if blocked and isinstance(gv, dict):
        msgs = gv.get("messages_ru")
        if isinstance(msgs, list) and msgs:
            br = "; ".join(str(m) for m in msgs)[:500]
    log_query_audit_event(
        event=evt,
        user_id=inp.user_id,
        role_key=inp.role_key,
        workspace_id=inp.workspace_id,
        prompt_excerpt=inp.raw_query,
        intent=str(out.intent),
        canonical_metric=canon,
        generated_sql_excerpt=out.generated_sql or out.validated_sql or "",
        validation_ok=sv.is_valid if sv else None,
        validation_errors=list(sv.errors) if sv else None,
        execution_status=out.execution_status,
        warnings=list(out.validation_warnings),
        blocked_reason=br,
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
        self._nl_parser = SemanticParser()

    @staticmethod
    def _interpretation_trace_fields(interp: NLQueryInterpretation) -> dict[str, Any]:
        notes: list[str] = []
        if interp.confidence_band == "medium":
            notes.append("Средняя уверенность интерпретации — проверьте резюме ниже.")
            notes.append(interp.human_summary_ru())
        return {
            "structured_interpretation": interp.model_dump(mode="json"),
            "interpretation_summary_ru": interp.human_summary_ru(),
            "interpretation_band": interp.confidence_band,
            "interpretation_notes": notes,
        }

    def _policy_guard_output(
        self,
        inp: OrchestrationInput,
        persistence_context: Any,
        *,
        started: datetime,
        raw: str,
        effective: str,
        is_follow_up: bool,
        intent: Any,
        entities: dict[str, Any],
        resolutions: list[Any],
        steps: list[PipelineStepTrace],
        messages: list[str],
        codes: list[str],
        interp: NLQueryInterpretation,
        dialogue_res: Any,
        clar: Optional[ClarificationResponse] = None,
        conf: float = 0.25,
    ) -> OrchestrationOutput:
        clar_f = clar or ClarificationResponse()
        ambiguity = _ambiguity_from_clarification(clar_f)
        guardrails = {"blocked": True, "codes": codes, "messages_ru": messages}
        insight = "Запрос заблокирован политикой безопасности: " + " ".join(messages)
        explainability_text = self._explainability.generate(
            query=effective,
            intent=intent,
            entities=entities,
            clarification_required=False,
        )
        out = OrchestrationOutput(
            preprocessed_query=raw,
            effective_query=effective,
            is_follow_up=is_follow_up,
            intent=intent,
            entities=dict(entities),
            semantic_resolutions=list(resolutions),
            ambiguity=ambiguity,
            confidence_score=conf,
            generated_sql="",
            validated_sql="",
            validation_warnings=list(messages),
            execution_status="failed",
            insight_text=insight,
            trace_payload={
                "intent": intent,
                "pipeline_steps": [s.model_dump() for s in steps],
                "explainability_text": explainability_text,
                "guardrails": guardrails,
                "clarification": {**clar_f.model_dump(), "confidence_score": conf},
                "dialogue": dialogue_res.to_api_dict(),
                "inheritance_trace": dialogue_res.inheritance_trace,
                "effective_query": effective,
                "entities": dict(entities),
                "semantic_terms": [r.model_dump() for r in resolutions],
                "forecast_mode": {"active": False, "method": None},
                "forecast_selection": {},
                "quality_gate": {"status": "failed", "reasons": ["guardrails"]},
                **self._interpretation_trace_fields(interp),
            },
            pipeline_steps=steps,
            started_at=started,
            finished_at=datetime.utcnow(),
            clarification=clar_f,
            dialogue=dialogue_res,
        )
        self._call_persistence(out, persistence_context)
        return out

    def run(
        self,
        inp: OrchestrationInput,
        *,
        persistence_context: Any = None,
    ) -> OrchestrationOutput:
        steps: list[PipelineStepTrace] = []
        started = datetime.utcnow()

        def finish(local: OrchestrationOutput) -> OrchestrationOutput:
            _audit_emit(inp, local)
            return local

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

        interp, entity_patch = self._nl_parser.build(
            effective_query=effective,
            intent=intent_res.intent,
            intent_signals=intent_res.signals,
            entities=dict(entities),
        )
        for k, v in entity_patch.items():
            if v is not None and v != "":
                entities[k] = v
        interp = interp.model_copy(update={"entities": dict(entities)})
        steps.append(
            _step(
                "semantic_parse",
                True,
                interpretation=interp.model_dump(mode="json"),
                summary_ru=interp.human_summary_ru(),
            )
        )

        abuse_errs = check_prompt_abuse(effective, settings)
        rate_errs = check_rate_limit(settings=settings, user_id=inp.user_id, role_key=inp.role_key)
        policy_prompt = abuse_errs + rate_errs
        if policy_prompt:
            codes: list[str] = []
            if abuse_errs:
                codes.append("prompt_abuse")
            if rate_errs:
                codes.append("rate_limit")
            steps.append(_step("guardrails_policy", False, codes=codes, messages=policy_prompt))
            return finish(
                self._policy_guard_output(
                    inp,
                    persistence_context,
                    started=started,
                    raw=raw,
                    effective=effective,
                    is_follow_up=is_follow_up,
                    intent=intent_res.intent,
                    entities=dict(entities),
                    resolutions=[],
                    steps=steps,
                    messages=policy_prompt,
                    codes=codes,
                    interp=interp,
                    dialogue_res=dialogue_res,
                    conf=0.2,
                )
            )

        resolutions = self._semantic.resolve_with_hint(effective, str(entities.get("metric_hint") or ""))
        if resolutions:
            # Канонический ключ первой резолюции = то, что уходит в SQL через semantic mapping.
            entities["canonical_metric_key"] = resolutions[0].term_key
        steps.append(
            _step(
                "resolve_semantic_terms",
                True,
                terms=[r.model_dump() for r in resolutions],
            )
        )

        metric_policy = evaluate_canonical_metric_for_role(
            role_key=inp.role_key,
            canonical_metric_key=str(entities.get("canonical_metric_key") or "").strip() or None,
        )
        if metric_policy:
            steps.append(
                _step(
                    "guardrails_policy",
                    False,
                    codes=["metric_policy"],
                    messages=metric_policy,
                )
            )
            return finish(
                self._policy_guard_output(
                    inp,
                    persistence_context,
                    started=started,
                    raw=raw,
                    effective=effective,
                    is_follow_up=is_follow_up,
                    intent=intent_res.intent,
                    entities=dict(entities),
                    resolutions=list(resolutions),
                    steps=steps,
                    messages=metric_policy,
                    codes=["metric_policy"],
                    interp=interp,
                    dialogue_res=dialogue_res,
                    conf=0.3,
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
                interpretation=interp,
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

        conf = self._clarification.score_confidence(
            resolutions, intent_res.signals, clar, interpretation=interp
        )
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
                    "forecast_selection": {},
                    "quality_gate": {"status": "warning", "reasons": ["clarification_required"]},
                    **self._interpretation_trace_fields(interp),
                },
                pipeline_steps=steps,
                started_at=started,
                finished_at=datetime.utcnow(),
                clarification=clar,
                dialogue=dialogue_res,
            )
            self._call_persistence(out, persistence_context)
            return finish(out)

        metric_sql = self._semantic.primary_metric_sql(resolutions)
        use_campaigns = self._semantic.needs_marketing_join(effective)
        source_table = (
            inp.notebook_context.get("source_table")
            or inp.notebook_context.get("ds_staging_qualified")
            or settings.ds_default_source_table
        )

        base_sql_source = "semantic_mapping" if nd_semantic > 0 else "default_template"
        template_sql = self._sql_gen.generate(
            intent_res.intent,
            entities,
            metric_sql,
            use_campaigns_only=use_campaigns,
            workspace_id=inp.workspace_id,
            source_table=str(source_table),
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

        vres = self._sql_exec.validate(
            draft_sql,
            role_key=inp.role_key,
            intent=intent_res.intent,
            entities=dict(entities),
        )
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
                    "forecast_selection": {},
                    "quality_gate": {"status": "failed", "reasons": ["sql_validation_failed"]},
                    **self._interpretation_trace_fields(interp),
                },
                pipeline_steps=steps,
                started_at=started,
                finished_at=datetime.utcnow(),
                sql_validation=vres,
                clarification=clar,
                dialogue=dialogue_res,
            )
            self._call_persistence(out, persistence_context)
            return finish(out)

        cache_key = make_nl_sql_cache_key(
            workspace_id=inp.workspace_id,
            user_id=inp.user_id,
            role_key=inp.role_key,
            final_sql=vres.final_sql,
        )
        cached = try_get_cached_sql_result(cache_key)
        if cached is not None:
            steps.append(_step("execute_sql", True, rows=cached.rowcount, cache_hit=True))
            exec_res = ExecutionResult(
                ok=True,
                rows=list(cached.rows),
                columns=list(cached.columns),
                rowcount=cached.rowcount,
                error=None,
                normalized_sql=vres.normalized_sql,
                final_sql=cached.final_sql,
                validation_warnings=list(validation_warnings)
                + ["Результаты получены из кэша типового запроса (ускорение повторных запросов)."],
                sql_validation=vres,
            )
        else:
            exec_res = self._sql_exec.execute(validation=vres)
            if exec_res.ok and exec_res.rows is not None:
                store_cached_sql_result(
                    cache_key,
                    CachedSqlResult(
                        rows=list(exec_res.rows),
                        columns=list(exec_res.columns),
                        rowcount=exec_res.rowcount,
                        final_sql=exec_res.final_sql,
                    ),
                )

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
                    "forecast_selection": {},
                    "quality_gate": {"status": "failed", "reasons": ["sql_execution_failed"]},
                    **self._interpretation_trace_fields(interp),
                },
                pipeline_steps=steps,
                started_at=started,
                finished_at=datetime.utcnow(),
                sql_validation=exec_res.sql_validation,
                clarification=clar,
                dialogue=dialogue_res,
            )
            self._call_persistence(out, persistence_context)
            return finish(out)

        steps.append(_step("execute_sql", True, rows=exec_res.rowcount))

        combined_validation_warnings = list(dict.fromkeys([*validation_warnings, *list(exec_res.validation_warnings)]))
        if exec_res.rowcount == 0:
            empty_msg = (
                "Запрос вернул 0 строк — проверьте фильтры, период и наличие данных в выбранной таблице-источнике."
            )
            combined_validation_warnings.append(empty_msg)
            vres = vres.model_copy(
                update={
                    "warnings": list(dict.fromkeys([*vres.warnings, empty_msg])),
                    "data_correctness": {
                        **vres.data_correctness,
                        "empty_result": True,
                        "empty_result_note_ru": empty_msg,
                    },
                }
            )

        exec_res = ExecutionResult(
            ok=exec_res.ok,
            rows=exec_res.rows,
            columns=exec_res.columns,
            rowcount=exec_res.rowcount,
            error=exec_res.error,
            normalized_sql=exec_res.normalized_sql,
            final_sql=exec_res.final_sql,
            validation_warnings=combined_validation_warnings,
            sql_validation=vres,
        )

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

        qg_reasons: list[str] = []
        if combined_validation_warnings:
            qg_reasons.append("validation_warnings_present")
        if exec_res.rowcount == 0:
            qg_reasons.append("empty_result")
        qg_status = "warning" if qg_reasons else "passed"

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
            "query_explanation": vres.query_explanation,
            "sql_preview": vres.preview_assessment,
            "sql_performance": dict(vres.performance or {}),
            "explain_warnings_ru": list((vres.preview_assessment or {}).get("explain_warnings_ru") or []),
            "explainability_text": explainability_text,
            "clarification": {**clar.model_dump(), "confidence_score": conf},
            "dialogue": dialogue_res.to_api_dict(),
            "inheritance_trace": dialogue_res.inheritance_trace,
            "effective_query": effective,
            "forecast_mode": {"active": forecast_active, "method": forecast_method},
            "forecast_selection": {},
            "quality_gate": {"status": qg_status, "reasons": qg_reasons},
            **self._interpretation_trace_fields(interp),
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
        return finish(out)

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
