import { requestJson } from "@/lib/api/request";
import { mockListCells, mockRunAnalytics } from "@/lib/api/mocks";
import { shouldForceAnalyticsMock } from "@/lib/api/config";
import type {
  AppendCellRequestDto,
  NotebookCellDto,
  RunCellRequestDto,
  RunCellResponseDto,
  RunNotebookAnalyticsRequestDto,
  RunNotebookAnalyticsResponseDto
} from "@/types/api/cells";

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
          forecast_mode: { active: false, method: null }
        }
      };
    }
  });
}

export async function runNotebookAnalytics(
  body: RunNotebookAnalyticsRequestDto
): Promise<RunNotebookAnalyticsResponseDto> {
  if (shouldForceAnalyticsMock()) {
    return mockRunAnalytics(body.notebook_id, body.prompt);
  }
  return requestJson({
    path: "/api/v1/analytics/run",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: () => mockRunAnalytics(body.notebook_id, body.prompt),
    // Analytics must stay real-data only unless force-mock is explicitly enabled.
    allowFallback: false
  });
}
