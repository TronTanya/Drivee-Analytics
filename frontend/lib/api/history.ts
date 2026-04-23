import { ApiError, apiFetchJson } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";
import { requestJson } from "@/lib/api/request";
import { mockListNotebookRuns, mockListQueryHistory } from "@/lib/api/mocks";
import type { NotebookRunDto, QueryHistoryDto, QueryHistoryFilters } from "@/types/api/history";

type HistoryApiItem = {
  id: string;
  notebook_id: string;
  owner_user_id?: string | null;
  original_query: string;
  interpreted_intent: Record<string, unknown>;
  interpreted_summary?: string | null;
  generated_sql_preview: string;
  chart_type?: string | null;
  table_row_count?: number | null;
  validation_status: string;
  execution_status: string;
  created_at: string;
  rerun_notebook_id: string;
  rerun_cell_id: string;
  save_as_report_body_hint: Record<string, unknown>;
};

function mapHistoryItem(row: HistoryApiItem): QueryHistoryDto {
  return {
    id: row.id,
    ran_at: row.created_at,
    label: row.original_query,
    sql_preview: row.generated_sql_preview,
    notebook_id: row.notebook_id,
    validation_ok: row.validation_status === "passed",
    validation_hint: row.validation_status,
    duration_ms: 0,
    chart_type: row.chart_type ?? undefined,
    interpreted_summary: row.interpreted_summary ?? undefined,
    owner_user_id: row.owner_user_id ?? undefined,
    rerun_cell_id: row.rerun_cell_id,
    rerun_notebook_id: row.rerun_notebook_id,
    save_as_report_body_hint: row.save_as_report_body_hint
  };
}

function buildHistoryPath(workspaceId: string, filters: QueryHistoryFilters): string {
  const qs = new URLSearchParams({ workspace_id: workspaceId });
  if (filters.q) qs.set("q", filters.q);
  if (filters.date_from) qs.set("date_from", filters.date_from);
  if (filters.date_to) qs.set("date_to", filters.date_to);
  if (filters.query_type) qs.set("query_type", filters.query_type);
  if (filters.scope) qs.set("scope", filters.scope);
  if (filters.owner_user_id) qs.set("owner_user_id", filters.owner_user_id);
  return `/api/v1/history?${qs.toString()}`;
}

export async function fetchNotebookRuns(): Promise<NotebookRunDto[]> {
  return requestJson({
    path: "/api/v1/history/notebook-runs",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListNotebookRuns()
  });
}

export async function fetchQueryHistory(
  workspaceId: string,
  filters: QueryHistoryFilters = {}
): Promise<QueryHistoryDto[]> {
  if (isApiMockOnly()) {
    return mockListQueryHistory();
  }
  const path = buildHistoryPath(workspaceId, filters);
  try {
    const rows = await apiFetchJson<HistoryApiItem[]>(path, { method: "GET", cache: "no-store" });
    return Array.isArray(rows) ? rows.map(mapHistoryItem) : [];
  } catch (e) {
    if (isApiMockFallback() && (e instanceof ApiError ? e.status >= 500 || e.status === 404 || e.status === 401 : true)) {
      return mockListQueryHistory();
    }
    throw e;
  }
}

export async function rerunNotebookRun(runId: string): Promise<{ status: string }> {
  return requestJson({
    path: `/api/v1/history/notebook-runs/${encodeURIComponent(runId)}/rerun`,
    init: { method: "POST" },
    mock: async () => ({ status: "queued" })
  });
}

export async function saveRunAsReport(runId: string, name: string): Promise<{ report_id: string }> {
  return requestJson({
    path: `/api/v1/history/notebook-runs/${encodeURIComponent(runId)}/save-report`,
    init: { method: "POST", body: JSON.stringify({ name }) },
    mock: async () => ({ report_id: `r-${Date.now()}` })
  });
}
