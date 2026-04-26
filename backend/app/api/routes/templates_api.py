from __future__ import annotations

import hashlib
import json
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_active_user, get_db_session
from app.core.config import settings
from app.core.exceptions import ForbiddenException, NotFoundException
from app.services.cache.ttl_cache import TTLCache
from app.models.user import User
from app.repositories.query_template_repository import QueryTemplateRepository
from app.repositories.workspace_repository import WorkspaceRepository
from fastapi.encoders import jsonable_encoder

from app.schemas.reporting import QueryTemplateResponse, TemplateQuickRunResponse
from app.services.analytics_pipeline import analyze_natural_language
from app.services.orchestration.sql_execution_service import SQLExecutionService

router = APIRouter(prefix="/templates", tags=["templates"])

_tpl_run_cache: TTLCache[dict] | None = None


def _template_quick_run_cache() -> TTLCache[dict]:
    global _tpl_run_cache
    if _tpl_run_cache is None:
        _tpl_run_cache = TTLCache(
            maxsize=max(1, int(settings.template_quick_run_cache_max_entries)),
            ttl_seconds=float(settings.template_quick_run_cache_ttl_seconds),
        )
    return _tpl_run_cache


def _template_run_cache_key(
    template_id: uuid.UUID,
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    default_params: dict,
) -> str:
    h = hashlib.sha256(json.dumps(default_params, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:24]
    return f"{template_id}:{workspace_id}:{user_id}:{h}"


def _explainability_steps_from_trace(full_trace: dict | None) -> list[str]:
    if not isinstance(full_trace, dict):
        return []
    ht = full_trace.get("human_trace")
    if not isinstance(ht, dict):
        return []
    keys = (
        "intent_explanation",
        "metric_explanation",
        "grouping_explanation",
        "period_explanation",
        "chart_explanation",
        "sql_safety_explanation",
    )
    out: list[str] = []
    for k in keys:
        v = str(ht.get(k) or "").strip()
        if v:
            out.append(v)
    return out[:7]


def _require_workspace(session: Session, user_id: uuid.UUID, workspace_id: uuid.UUID) -> None:
    if not WorkspaceRepository(session).user_has_workspace_access(user_id, workspace_id):
        raise ForbiddenException("No access to this workspace")


@router.get("", response_model=list[QueryTemplateResponse])
def list_templates(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> list[QueryTemplateResponse]:
    _require_workspace(session, user.id, workspace_id)
    if not user.role:
        raise ForbiddenException("User has no role")
    rows = QueryTemplateRepository(session).list_for_workspace_and_role(workspace_id, user.role.id)
    out: list[QueryTemplateResponse] = []
    for r in rows:
        rk = r.target_role.role_key if r.target_role else None
        base = QueryTemplateResponse.model_validate(r)
        out.append(base.model_copy(update={"target_role_key": rk}))
    return out


@router.post("/{template_id}/run", response_model=TemplateQuickRunResponse)
def quick_run_template(
    template_id: uuid.UUID,
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_active_user),
    session: Session = Depends(get_db_session),
) -> TemplateQuickRunResponse:
    _require_workspace(session, user.id, workspace_id)
    tpl = QueryTemplateRepository(session).get_in_workspace(template_id, workspace_id)
    if not tpl:
        raise NotFoundException("Template not found")
    if user.role and tpl.target_role_id and tpl.target_role_id != user.role.id:
        raise ForbiddenException("This template is not available for your role")
    params = dict(tpl.default_params_json or {})
    ck = _template_run_cache_key(template_id, workspace_id, user.id, params)
    hit = _template_quick_run_cache().get(ck)
    if hit is not None:
        return TemplateQuickRunResponse.model_validate(hit)

    role_key = user.role.role_key if user.role else None
    sql_body = (tpl.sql_template or "").strip()
    if sql_body:
        exec_res = SQLExecutionService().execute(sql=sql_body, role_key=role_key)
        rows_safe = jsonable_encoder(exec_res.rows) if exec_res.ok else []
        chart_t = (tpl.default_chart_type or "line").strip().lower() or "line"
        if exec_res.ok:
            n = len(rows_safe)
            resp = TemplateQuickRunResponse(
                template_id=template_id,
                execution_status="succeeded",
                safe_sql=exec_res.final_sql or sql_body,
                insight=f"Выполнен шаблон «{tpl.template_name}»: {n} строк из public.incity_orders.",
                chart_type=chart_t,
                table_records=rows_safe,
                confidence=0.9,
                warnings=list(exec_res.validation_warnings),
                interpreted_intent=f"template_sql:{tpl.template_key}",
                trace_summary="Прямой SQL template run (без NL-оркестрации).",
                explainability_trace=[
                    "Источник: SQL template из query_templates.",
                    f"Роль: {role_key or 'unknown'}.",
                    "SQL прошёл validation и выполнен напрямую.",
                ],
            )
        else:
            # Safety fallback: если прямой SQL шаблона не прошёл валидацию/исполнение,
            # пытаемся выполнить тот же шаблон через NL→SQL pipeline.
            fallback_result = analyze_natural_language(
                tpl.nl_prompt_template,
                notebook_context=dict(tpl.default_params_json or {}),
                workspace_id=str(workspace_id),
                role_key=role_key,
                user_id=str(user.id),
                db_session=session,
            )
            fallback_warnings = list(fallback_result.warnings)
            fallback_warnings.extend(list(exec_res.validation_warnings))
            if exec_res.error:
                fallback_warnings.append(f"SQL template fallback: {exec_res.error}")
            resp = TemplateQuickRunResponse(
                template_id=template_id,
                execution_status=fallback_result.execution_status,
                safe_sql=fallback_result.safe_sql or exec_res.final_sql or sql_body,
                insight=fallback_result.insight,
                chart_type=fallback_result.chart_type or chart_t,
                table_records=list(fallback_result.table_records),
                confidence=fallback_result.confidence,
                warnings=fallback_warnings,
                interpreted_intent=str((fallback_result.parsed or {}).get("intent") or ""),
                trace_summary=fallback_result.trace_summary or "",
                explainability_trace=_explainability_steps_from_trace(fallback_result.full_trace),
            )
    else:
        result = analyze_natural_language(
            tpl.nl_prompt_template,
            notebook_context=dict(tpl.default_params_json or {}),
            workspace_id=str(workspace_id),
            role_key=role_key,
            user_id=str(user.id),
            db_session=session,
        )
        resp = TemplateQuickRunResponse(
            template_id=template_id,
            execution_status=result.execution_status,
            safe_sql=result.safe_sql,
            insight=result.insight,
            chart_type=result.chart_type,
            table_records=list(result.table_records),
            confidence=result.confidence,
            warnings=list(result.warnings),
            interpreted_intent=str((result.parsed or {}).get("intent") or ""),
            trace_summary=result.trace_summary or "",
            explainability_trace=_explainability_steps_from_trace(result.full_trace),
        )
    if resp.execution_status == "succeeded":
        _template_quick_run_cache().set(ck, resp.model_dump(mode="json"))
    return resp
