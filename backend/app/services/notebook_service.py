from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any, Optional

from app.core.config import settings
from app.core.exceptions import (
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from app.models.notebook import CellRun, Notebook, NotebookCell
from app.repositories.notebook_repository import NotebookRepository
from app.repositories.workspace_repository import WorkspaceRepository
from app.schemas.notebook import (
    CellRunResponse,
    NotebookCellCreateRequest,
    NotebookCellResponse,
    NotebookCreateRequest,
    NotebookDetailResponse,
    NotebookListItemResponse,
    NotebookPatchRequest,
    NotebookSaveScenarioRequest,
    RerunNotebookResponse,
    RunCellRequest,
    RunCellResponse,
    SaveNotebookResponse,
)
from app.schemas.clarification import clarification_reason_summary_ru
from app.schemas.notebook_context import NotebookContext, ScenarioSnapshot
from app.services.analytics_pipeline import (
    NaturalLanguageAnalysisResult,
    analyze_natural_language,
    build_explainability_trace_v1,
)
from app.utils.time import utc_now

if TYPE_CHECKING:
    from app.models.user import User


def _forecast_payload_for_cell(analysis: Any) -> dict[str, Any]:
    ft = dict(analysis.full_trace or {})
    exp = ft.get("forecast_explainability")
    out: dict[str, Any] = {"records": list(analysis.forecast_records or [])}
    if isinstance(exp, dict):
        out["explainability"] = dict(exp)
    return out


ALLOWED_CELL_TYPES = frozenset(
    {"prompt", "clarification", "sql", "table", "chart", "insight", "trace", "forecast"}
)


class NotebookService:
    def __init__(
        self,
        workspace_repository: WorkspaceRepository,
        notebook_repository: NotebookRepository,
    ) -> None:
        self._workspaces = workspace_repository
        self._notebooks = notebook_repository

    def _session(self):
        return self._notebooks.session

    def _resolve_workspace_id(self, user: User, workspace_id: Optional[uuid.UUID]) -> uuid.UUID:
        if workspace_id:
            if not self._workspaces.user_has_workspace_access(user.id, workspace_id):
                raise ForbiddenException("No access to this workspace")
            return workspace_id
        default_id = self._workspaces.get_default_workspace_id_for_user(user.id)
        if not default_id:
            raise ValidationException("No workspace available for user; specify workspace_id")
        return default_id

    def _can_access_notebook(self, user: User, notebook: Notebook) -> bool:
        if notebook.owner_user_id == user.id:
            return True
        return self._workspaces.user_has_workspace_access(user.id, notebook.workspace_id)

    def _get_notebook_or_404(self, notebook_id: uuid.UUID) -> Notebook:
        notebook = self._notebooks.get_by_id(notebook_id)
        if not notebook:
            raise NotFoundException("Notebook not found")
        return notebook

    def create_notebook(self, user: User, body: NotebookCreateRequest) -> NotebookDetailResponse:
        ws_id = self._resolve_workspace_id(user, body.workspace_id)
        ctx: dict[str, Any] = {}
        if body.initial_context:
            ctx = body.initial_context.to_json_dict()
        notebook = Notebook(
            workspace_id=ws_id,
            owner_user_id=user.id,
            title=body.title,
            description=body.description,
            notebook_status="active",
            context_chain_json=ctx,
        )
        self._notebooks.create_notebook(notebook)
        self._session().commit()
        self._session().refresh(notebook)
        return self.get_notebook(user, notebook.id)

    def list_notebooks(self, user: User, workspace_id: Optional[uuid.UUID]) -> list[NotebookListItemResponse]:
        ws_id = self._resolve_workspace_id(user, workspace_id)
        rows = self._notebooks.list_for_workspace(ws_id)
        return [NotebookListItemResponse.model_validate(n) for n in rows]

    def get_notebook(self, user: User, notebook_id: uuid.UUID) -> NotebookDetailResponse:
        notebook = self._notebooks.get_by_id_with_cells(notebook_id)
        if not notebook:
            raise NotFoundException("Notebook not found")
        if not self._can_access_notebook(user, notebook):
            raise ForbiddenException("No access to this notebook")
        cells = sorted(notebook.cells, key=lambda c: c.position)
        return NotebookDetailResponse(
            id=notebook.id,
            workspace_id=notebook.workspace_id,
            owner_user_id=notebook.owner_user_id,
            title=notebook.title,
            description=notebook.description,
            notebook_status=notebook.notebook_status,
            context_chain_json=dict(notebook.context_chain_json or {}),
            latest_cell_id=notebook.latest_cell_id,
            created_at=notebook.created_at,
            updated_at=notebook.updated_at,
            cells=[NotebookCellResponse.model_validate(c) for c in cells],
        )

    def patch_notebook(self, user: User, notebook_id: uuid.UUID, body: NotebookPatchRequest) -> NotebookDetailResponse:
        if not body.model_dump(exclude_unset=True):
            raise ValidationException("Укажите хотя бы одно поле: title, description или notebook_status")
        notebook = self._get_notebook_or_404(notebook_id)
        if not self._can_access_notebook(user, notebook):
            raise ForbiddenException("No access to this notebook")
        if body.title is not None:
            notebook.title = body.title.strip()
        if body.description is not None:
            notebook.description = body.description
        if body.notebook_status is not None:
            notebook.notebook_status = body.notebook_status.strip()
        self._session().add(notebook)
        self._session().commit()
        self._session().refresh(notebook)
        return self.get_notebook(user, notebook_id)

    def add_cell(self, user: User, notebook_id: uuid.UUID, body: NotebookCellCreateRequest) -> NotebookCellResponse:
        notebook = self._get_notebook_or_404(notebook_id)
        if not self._can_access_notebook(user, notebook):
            raise ForbiddenException("No access to this notebook")
        if body.cell_type not in ALLOWED_CELL_TYPES:
            raise ValidationException("Invalid cell type")
        if body.cell_type == "prompt" and not (body.prompt_text and body.prompt_text.strip()):
            raise ValidationException("prompt_text is required for prompt cells")

        next_pos = self._notebooks.max_cell_position(notebook_id) + 1
        if body.position is not None and body.position != next_pos:
            raise ValidationException("Only append is supported: omit position or set it to the next index")

        snap: dict[str, Any] = {}
        if body.context_snapshot:
            snap = body.context_snapshot.to_json_dict()
        elif notebook.context_chain_json:
            snap = dict(notebook.context_chain_json)

        cell = NotebookCell(
            notebook_id=notebook_id,
            cell_type=body.cell_type,
            position=next_pos,
            prompt_text=body.prompt_text,
            parent_cell_id=body.parent_cell_id,
            context_snapshot_json=snap,
            clarification_question=body.clarification_question,
            clarification_options_json=body.clarification_options_json
            if body.clarification_options_json is not None
            else [],
            created_by=user.id,
        )
        self._notebooks.add_cell(cell)
        notebook.latest_cell_id = cell.id
        self._session().add(notebook)
        self._session().commit()
        self._session().refresh(cell)
        return NotebookCellResponse.model_validate(cell)

    def _finalize_prompt_cell_run(
        self,
        user: "User",
        notebook: Notebook,
        cell: NotebookCell,
        run: CellRun,
        started: datetime,
        analysis: NaturalLanguageAnalysisResult,
        prompt: str,
    ) -> list[NotebookCell]:
        """Обновляет prompt-ячейку, дочерние ячейки и контекст ноутбука после анализа (без commit)."""
        needs_clarification = analysis.clarification_required
        cell.clarification_required = needs_clarification
        cell.clarification_question = analysis.clarification_question or None
        cell.clarification_options_json = list(analysis.clarification_options)
        cell.generated_sql = analysis.safe_sql if not needs_clarification else None
        exec_ok = analysis.execution_status == "succeeded"
        if needs_clarification:
            cell.validation_status = "pending"
            cell.execution_status = "not_started"
        else:
            cell.validation_status = "passed" if exec_ok else "failed"
            cell.execution_status = "succeeded" if exec_ok else "failed"
        cell.confidence_score = Decimal(str(round(analysis.confidence, 4)))
        cell.interpreted_intent = dict(analysis.parsed)
        explainability = build_explainability_trace_v1(analysis)
        cell.trace_payload_json = {
            "explainability": explainability.model_dump(mode="json"),
            "warnings": analysis.warnings,
            "used_tables": analysis.used_tables,
            "used_columns": analysis.used_columns,
            "summary": analysis.trace_summary,
            "sql_generation": {
                "source": analysis.sql_generation_source,
                "applied_correction_id": analysis.applied_correction_id,
                "correction_similarity": analysis.correction_similarity,
                "correction_match_kind": analysis.correction_match_kind,
            },
            "orchestration": analysis.full_trace,
            "clarification": {
                "clarification_required": analysis.clarification_required,
                "clarification_reason": analysis.clarification_reason,
                "clarification_question": analysis.clarification_question,
                "clarification_options": analysis.clarification_options,
                "confidence_score": float(analysis.confidence),
            },
            "dialogue": analysis.dialogue,
            "visualization": analysis.visualization,
        }
        cell.insight_text = analysis.insight
        cell.chart_type = analysis.chart_type or "line"
        cell.context_snapshot_json = {
            **dict(cell.context_snapshot_json or {}),
            "dialogue": analysis.dialogue,
            "entities": analysis.full_trace.get("entities"),
            "source_table": getattr(analysis, "resolved_source_table", None) or "",
        }

        run.generated_sql = analysis.safe_sql
        run.run_status = "succeeded" if (exec_ok or needs_clarification) else "failed"
        run.finished_at = utc_now()
        run.duration_ms = int((run.finished_at - started).total_seconds() * 1000)
        run.rows_returned = len(analysis.table_records)
        cap = int(getattr(settings, "sql_execution_hard_row_cap", 1_000_000) or 1_000_000)
        run.result_preview_json = list(analysis.table_records)[: min(len(analysis.table_records), cap)]
        run.confidence_score = cell.confidence_score
        run.trace_payload_json = dict(cell.trace_payload_json)
        run.validation_report_json = {"status": cell.validation_status, "warnings": analysis.warnings}

        appended: list[NotebookCell] = []
        notebook_id = notebook.id
        base_pos = self._notebooks.max_cell_position(notebook_id)
        pos = base_pos + 1

        if needs_clarification:
            child_specs = [
                (
                    "trace",
                    {
                        "insight_text": analysis.trace_summary,
                        "trace_payload_json": {
                            "summary": analysis.trace_summary,
                            "explainability": explainability.model_dump(mode="json"),
                        },
                    },
                ),
                (
                    "clarification",
                    {
                        "clarification_question": analysis.clarification_question,
                        "clarification_options_json": analysis.clarification_options,
                        "insight_text": analysis.clarification_reason or analysis.clarification_question,
                        "interpreted_intent": {
                            "awaiting_clarification": True,
                            "reason": analysis.clarification_reason,
                            "reason_summary_ru": analysis.clarification_reason_summary_ru
                            or clarification_reason_summary_ru(analysis.clarification_reason),
                        },
                        "validation_status": "pending",
                        "execution_status": "not_started",
                    },
                ),
            ]
        else:
            child_specs = [
                (
                    "trace",
                    {
                        "insight_text": analysis.trace_summary,
                        "trace_payload_json": {
                            "summary": analysis.trace_summary,
                            "explainability": explainability.model_dump(mode="json"),
                        },
                    },
                ),
                ("sql", {"generated_sql": analysis.safe_sql}),
                (
                    "table",
                    {
                        "trace_payload_json": {"records": analysis.table_records},
                        "insight_text": f"{len(analysis.table_records)} rows",
                    },
                ),
                ("chart", {"insight_text": analysis.chart_hint, "chart_type": analysis.chart_type or "line"}),
                ("insight", {"insight_text": analysis.insight}),
                (
                    "forecast",
                    {
                        "forecast_payload_json": _forecast_payload_for_cell(analysis),
                    },
                ),
            ]

        for ctype, fields in child_specs:
            fm = dict(fields)
            vstat = fm.pop("validation_status", "passed")
            estat = fm.pop("execution_status", "succeeded")
            child = NotebookCell(
                notebook_id=notebook_id,
                cell_type=ctype,
                position=pos,
                parent_cell_id=cell.id,
                context_snapshot_json=dict(cell.context_snapshot_json or {}),
                validation_status=vstat,
                execution_status=estat,
                created_by=user.id,
            )
            for key, val in fm.items():
                setattr(child, key, val)
            self._notebooks.add_cell(child)
            appended.append(child)
            pos += 1

        if appended:
            notebook.latest_cell_id = appended[-1].id
            self._session().add(notebook)

        ctx = NotebookContext.from_json_dict(dict(notebook.context_chain_json or {}))
        if needs_clarification:
            ctx.last_intent = analysis.clarification_question or analysis.trace_summary
            ctx.clarification_round = int(ctx.clarification_round or 0) + 1
        else:
            ctx.last_intent = analysis.trace_summary
            ctx.last_user_query = prompt
            d_block = analysis.dialogue or {}
            ctx.last_rewritten_query = d_block.get("rewritten_query_for_execution") or analysis.full_trace.get(
                "effective_query"
            )
            ctx.last_intent_kind = analysis.parsed.get("intent")
            ctx.base_metric = analysis.parsed.get("metric")
            ctx.dialogue_turn = int(ctx.dialogue_turn or 0) + 1
            ents = analysis.full_trace.get("entities") or {}
            af = dict(ctx.active_filters or {})
            if ents.get("city_id"):
                af["city_id"] = str(ents["city_id"])
            if ents.get("status_order"):
                af["status_order"] = str(ents["status_order"])
            ctx.active_filters = af
            if ents.get("status_order_in"):
                ctx.status_filters = [str(v) for v in list(ents["status_order_in"])]
        notebook.context_chain_json = ctx.to_json_dict()
        self._session().add(notebook)
        return appended

    def append_pipeline_run_from_analysis(
        self,
        user: "User",
        notebook_id: uuid.UUID,
        prompt: str,
        analysis: NaturalLanguageAnalysisResult,
    ) -> None:
        """
        Сохраняет один запуск POST /analytics/run в ячейки ноутбука (для GET /history и канвы из БД).
        """
        text = (prompt or "").strip()
        if not text:
            raise ValidationException("prompt is empty")
        notebook = self._notebooks.get_by_id_with_cells(notebook_id)
        if not notebook:
            raise NotFoundException("Notebook not found")
        if not self._can_access_notebook(user, notebook):
            raise ForbiddenException("No access to this notebook")

        next_pos = self._notebooks.max_cell_position(notebook_id) + 1
        cell = NotebookCell(
            notebook_id=notebook_id,
            cell_type="prompt",
            position=next_pos,
            prompt_text=text,
            context_snapshot_json=dict(notebook.context_chain_json or {}),
            created_by=user.id,
        )
        self._notebooks.add_cell(cell)
        self._session().flush()

        started = utc_now()
        run_number = self._notebooks.next_cell_run_number(cell.id)
        run = CellRun(
            cell_id=cell.id,
            notebook_id=notebook_id,
            run_number=run_number,
            run_status="started",
            started_at=started,
        )
        self._notebooks.add_cell_run(run)
        self._session().flush()

        notebook = self._notebooks.get_by_id_with_cells(notebook_id)
        appended = self._finalize_prompt_cell_run(user, notebook, cell, run, started, analysis, text)
        self._session().commit()
        for obj in (run, cell, *appended):
            self._session().refresh(obj)

    def run_cell(
        self,
        user: User,
        notebook_id: uuid.UUID,
        cell_id: uuid.UUID,
        run_options: RunCellRequest | None = None,
    ) -> RunCellResponse:
        notebook = self._notebooks.get_by_id_with_cells(notebook_id)
        if not notebook:
            raise NotFoundException("Notebook not found")
        if not self._can_access_notebook(user, notebook):
            raise ForbiddenException("No access to this notebook")
        cell = self._notebooks.get_cell(notebook_id, cell_id)
        if not cell:
            raise NotFoundException("Cell not found")
        if cell.cell_type != "prompt":
            raise ValidationException("Only prompt cells can run the NL analytics pipeline")

        prompt = (cell.prompt_text or "").strip()
        if not prompt:
            raise ValidationException("Prompt cell has no text")

        opts = run_options or RunCellRequest()
        sidecar = opts.forecast_sidecar if opts.forecast_sidecar is not None else "auto"

        run_number = self._notebooks.next_cell_run_number(cell.id)
        started = utc_now()
        run = CellRun(
            cell_id=cell.id,
            notebook_id=notebook_id,
            run_number=run_number,
            run_status="started",
            started_at=started,
        )
        self._notebooks.add_cell_run(run)
        self._session().flush()

        analysis = analyze_natural_language(
            prompt,
            notebook_context=dict(notebook.context_chain_json or {}),
            workspace_id=str(notebook.workspace_id) if notebook.workspace_id else None,
            role_key=user.role.role_key if user.role else None,
            user_id=str(user.id),
            db_session=self._session(),
            forecast_sidecar=sidecar,
            chart_type_override=opts.chart_type_override,
            forecast_horizon_steps=opts.forecast_horizon_steps,
        )
        appended = self._finalize_prompt_cell_run(user, notebook, cell, run, started, analysis, prompt)

        self._session().commit()
        for obj in (run, cell, *appended):
            self._session().refresh(obj)

        return RunCellResponse(
            cell_run=CellRunResponse.model_validate(run),
            source_cell=NotebookCellResponse.model_validate(cell),
            appended_cells=[NotebookCellResponse.model_validate(c) for c in appended],
        )

    def rerun_notebook(self, user: User, notebook_id: uuid.UUID) -> RerunNotebookResponse:
        notebook = self._notebooks.get_by_id_with_cells(notebook_id)
        if not notebook:
            raise NotFoundException("Notebook not found")
        if not self._can_access_notebook(user, notebook):
            raise ForbiddenException("No access to this notebook")
        prompts = [c for c in sorted(notebook.cells, key=lambda x: x.position) if c.cell_type == "prompt"]
        results: list[RunCellResponse] = []
        for p in prompts:
            results.append(self.run_cell(user, notebook_id, p.id, None))
        return RerunNotebookResponse(runs=results)

    def save_as_scenario(self, user: User, notebook_id: uuid.UUID, body: NotebookSaveScenarioRequest) -> SaveNotebookResponse:
        notebook = self._notebooks.get_by_id_with_cells(notebook_id)
        if not notebook:
            raise NotFoundException("Notebook not found")
        if not self._can_access_notebook(user, notebook):
            raise ForbiddenException("No access to this notebook")
        cells = sorted(notebook.cells, key=lambda c: c.position)
        ctx = NotebookContext.from_json_dict(dict(notebook.context_chain_json or {}))
        ctx.scenario = ScenarioSnapshot(
            title=body.scenario_title,
            description=body.scenario_description,
            saved_at=utc_now(),
            source_notebook_id=str(notebook.id),
            cell_ids=[str(c.id) for c in cells],
        )
        notebook.context_chain_json = ctx.to_json_dict()
        notebook.notebook_status = "active"
        self._session().add(notebook)
        self._session().commit()
        self._session().refresh(notebook)
        return SaveNotebookResponse(notebook_id=notebook.id, context_chain_json=dict(notebook.context_chain_json))
