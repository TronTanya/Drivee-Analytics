import { requestJson } from "@/lib/api/request";
import { mockListNotebookRuns, mockListQueryHistory } from "@/lib/api/mocks";
import type { NotebookRunDto, QueryHistoryDto } from "@/types/api/history";

export async function fetchNotebookRuns(): Promise<NotebookRunDto[]> {
  return requestJson({
    path: "/api/v1/history/notebook-runs",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListNotebookRuns()
  });
}

export async function fetchQueryHistory(): Promise<QueryHistoryDto[]> {
  return requestJson({
    path: "/api/v1/history/queries",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListQueryHistory()
  });
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
