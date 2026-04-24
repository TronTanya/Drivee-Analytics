import { requestJson } from "@/lib/api/request";
import { mockListCells, mockRunAnalytics } from "@/lib/api/mocks";
import { isApiMockFallback, shouldForceAnalyticsMock } from "@/lib/api/config";
import type {
  AppendCellRequestDto,
  NotebookCellDto,
  RunCellRequestDto,
  RunCellResponseDto,
  RunNotebookAnalyticsRequestDto,
  RunNotebookAnalyticsResponseDto
} from "@/types/api/cells";

function normalizeAnalyticsResponse(resp: RunNotebookAnalyticsResponseDto): RunNotebookAnalyticsResponseDto {
  const cells = Array.isArray(resp.cells) ? [...resp.cells] : [];
  const hasType = (t: NotebookCellDto["type"]) => cells.some((c) => c.type === t);

  if (!hasType("prompt") && typeof resp.question === "string" && resp.question.trim()) {
    cells.unshift({
      id: `prompt-${Date.now()}`,
      notebook_id: resp.notebook_id,
      type: "prompt",
      content: resp.question.trim()
    });
  }

  if (!hasType("trace")) {
    const interpreted = typeof resp.interpreted_query === "string" ? resp.interpreted_query.trim() : "";
    const summary = interpreted || "Интерпретация запроса";
    cells.push({
      id: `trace-${Date.now()}`,
      notebook_id: resp.notebook_id,
      type: "trace",
      content: summary,
      payload: {
        summary,
        interpreted_intent: interpreted,
        confidence: typeof resp.confidence === "number" ? resp.confidence : undefined,
        warnings: Array.isArray((resp.trace as { warnings?: string[] } | undefined)?.warnings)
          ? (resp.trace as { warnings?: string[] }).warnings
          : []
      }
    });
  }

  if (!hasType("sql") && typeof resp.safe_sql === "string" && resp.safe_sql.trim()) {
    cells.push({
      id: `sql-${Date.now()}`,
      notebook_id: resp.notebook_id,
      type: "sql",
      content: resp.safe_sql
    });
  }

  if (
    !hasType("table") &&
    resp.table &&
    Array.isArray(resp.table.columns) &&
    resp.table.columns.length > 0 &&
    Array.isArray(resp.table.rows)
  ) {
    cells.push({
      id: `table-${Date.now()}`,
      notebook_id: resp.notebook_id,
      type: "table",
      content: JSON.stringify(resp.table),
      payload: resp.table
    });
  }

  const traceClar =
    resp.trace && typeof resp.trace === "object" && "clarification_requested" in resp.trace
      ? Boolean((resp.trace as { clarification_requested?: boolean }).clarification_requested)
      : false;

  if (!hasType("chart") && resp.chart && typeof resp.chart === "object" && !traceClar) {
    cells.push({
      id: `chart-${Date.now()}`,
      notebook_id: resp.notebook_id,
      type: "chart",
      content: JSON.stringify(resp.chart),
      payload: resp.chart as Record<string, unknown>
    });
  }

  if (!hasType("insight") && typeof resp.insight === "string" && resp.insight.trim() && !traceClar) {
    cells.push({
      id: `insight-${Date.now()}`,
      notebook_id: resp.notebook_id,
      type: "insight",
      content: resp.insight.trim()
    });
  }

  return { runtime_mode: "live", ...resp, cells };
}

export async function fetchNotebookCells(notebookId: string): Promise<NotebookCellDto[]> {
  return requestJson({
    path: `/api/v1/notebooks/${encodeURIComponent(notebookId)}/cells`,
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListCells(notebookId)
  });
}

export async function appendNotebookCell(
  notebookId: string,
  body: AppendCellRequestDto
): Promise<NotebookCellDto> {
  return requestJson({
    path: `/api/v1/notebooks/${encodeURIComponent(notebookId)}/cells`,
    init: { method: "POST", body: JSON.stringify(body) },
    mock: async () => ({
      id: `c-${Date.now()}`,
      notebook_id: notebookId,
      type: body.type,
      content: body.content,
      payload: body.payload,
      position: 999
    })
  });
}

export async function runNotebookCell(
  notebookId: string,
  cellId: string,
  body: RunCellRequestDto = {}
): Promise<RunCellResponseDto> {
  return requestJson({
    path: `/api/v1/notebooks/${encodeURIComponent(notebookId)}/cells/${encodeURIComponent(cellId)}/run`,
    init: { method: "POST", body: JSON.stringify(body) },
    mock: async () => {
      const cells = await mockListCells(notebookId);
      const cell = cells.find((c) => c.id === cellId) ?? {
        id: cellId,
        notebook_id: notebookId,
        type: "sql",
        content: "-- mock run output",
        position: 0
      };
      return {
        cell: { ...cell, content: cell.content + "\n— mock run output" },
        trace: {
          schema_version: 1,
          interpreted_intent: "summary · revenue",
          extracted_entities: {},
          semantic_terms: [],
          tables_used: ["fct_orders"],
          result_columns: ["id"],
          generated_sql: "-- mock",
          validation_status: "passed",
          warnings: [],
          confidence: 0.9,
          clarification_requested: false,
          follow_up_context_used: false,
          learned_correction_used: false,
          chart_recommendation: {
            chart_type: "table",
            rationale: "",
            alternatives: []
          },
          forecast_mode: { active: false, method: null },
          forecast_selection: {
            metric_key: null,
            selected_strategy: null,
            backtest_summary: {},
            data_quality: {}
          },
          forecast_explainability: {},
          quality_gate: {
            status: "passed",
            reasons: []
          },
          execution_phases: [
            { phase_id: "parsing", label: "Парсинг и интерпретация", status: "done", detail: "" },
            { phase_id: "generating_sql", label: "Генерация SQL", status: "done", detail: "" },
            { phase_id: "validating", label: "Проверка SQL", status: "done", detail: "" },
            { phase_id: "executing", label: "Выполнение запроса", status: "done", detail: "" },
            { phase_id: "visualizing", label: "Визуализация", status: "done", detail: "" },
            { phase_id: "done", label: "Инсайт и финализация", status: "done", detail: "" }
          ]
        }
      };
    }
  });
}

export async function runNotebookAnalytics(
  body: RunNotebookAnalyticsRequestDto
): Promise<RunNotebookAnalyticsResponseDto> {
  if (shouldForceAnalyticsMock()) {
    const mockResp = await mockRunAnalytics(body);
    return { ...normalizeAnalyticsResponse(mockResp), runtime_mode: "mock-only" };
  }
  let runtimeMode: "live" | "fallback" | "mock-only" = "live";
  const liveResp = await requestJson({
    path: "/api/v1/analytics/run",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: () => mockRunAnalytics(body),
    onMockUsed: (mode) => {
      runtimeMode = mode;
    },
    /** При профиле fallback (в т.ч. demo по умолчанию) — только после сетевой/5xx/401 ошибки, не вместо успешного live. */
    allowFallback: isApiMockFallback()
  });
  return { ...normalizeAnalyticsResponse(liveResp), runtime_mode: runtimeMode };
}
