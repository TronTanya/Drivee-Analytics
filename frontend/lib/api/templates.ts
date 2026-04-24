import { ApiError, apiFetchJson } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly, isDemoModeEnabled } from "@/lib/api/config";
import { requestJson } from "@/lib/api/request";
import { getAccessToken } from "@/lib/api/token";
import { mockListNotebookTemplates, mockListQueryTemplates } from "@/lib/api/mocks";
import type { UserRole } from "@/lib/types";
import type { NotebookTemplateDto, QueryTemplateDto } from "@/types/api/templates";

type BackendQueryTemplate = {
  id: string;
  workspace_id: string;
  template_key: string;
  template_name: string;
  description: string | null;
  nl_prompt_template: string;
  sql_template?: string | null;
  default_chart_type?: string | null;
  default_params_json?: Record<string, unknown>;
  target_role_id?: string | null;
  target_role_key?: string | null;
  is_system: boolean;
};

function inferNotebookIdForTemplate(row: BackendQueryTemplate): string {
  const key = (row.template_key || "").toLowerCase();
  if (key.includes("revenue") || key.includes("top5") || key.includes("week_over")) return "strategy-board";
  if (key.includes("channel") || key.includes("conversion") || key.includes("orders_count")) return "campaign-q1";
  if (key.includes("ops") || key.includes("cancel")) return "ops-health";
  if (key.includes("city") || key.includes("marketing")) return "campaign-q1";
  if (key.includes("exec") || key.includes("strategy")) return "strategy-board";
  return "ops-health";
}

function mapQueryTemplate(r: BackendQueryTemplate): QueryTemplateDto {
  const rk = r.target_role_key ?? null;
  const role: UserRole =
    rk === "marketer" || rk === "executive" || rk === "admin" || rk === "manager" ? rk : "manager";
  return {
    id: r.id,
    name: r.template_name,
    description: r.description ?? "",
    role,
    sql: (r.sql_template && r.sql_template.trim()) || r.nl_prompt_template,
    default_notebook_id: inferNotebookIdForTemplate(r),
    template_key: r.template_key,
    nl_prompt_template: r.nl_prompt_template,
    sql_template: r.sql_template ?? null,
    default_chart_type: r.default_chart_type ?? undefined,
    target_role_key: rk
  };
}

function shouldUseDemoLocalMock(): boolean {
  return typeof window !== "undefined" && isDemoModeEnabled() && !getAccessToken();
}

function mapNotebookTemplate(r: BackendQueryTemplate): NotebookTemplateDto {
  const rk = r.target_role_key;
  const role: UserRole =
    rk === "marketer" || rk === "executive" || rk === "admin" || rk === "manager" ? rk : "manager";
  return {
    id: `nbtpl-${r.id}`,
    name: r.template_name,
    description: r.description ?? "Сценарий на базе query template",
    role,
    notebook_id: inferNotebookIdForTemplate(r)
  };
}

export async function fetchQueryTemplates(workspaceId: string): Promise<QueryTemplateDto[]> {
  if (isApiMockOnly() || shouldUseDemoLocalMock()) {
    return mockListQueryTemplates();
  }
  const path = `/api/v1/templates?workspace_id=${encodeURIComponent(workspaceId)}`;
  try {
    const rows = await apiFetchJson<BackendQueryTemplate[]>(path, { method: "GET", cache: "no-store" });
    return Array.isArray(rows) ? rows.map(mapQueryTemplate) : [];
  } catch (e) {
    if (isApiMockFallback() && e instanceof ApiError && (e.status === 401 || e.status === 404 || e.status >= 500)) {
      return mockListQueryTemplates();
    }
    throw e;
  }
}

export async function fetchNotebookTemplates(workspaceId: string | undefined): Promise<NotebookTemplateDto[]> {
  if (!workspaceId?.trim()) {
    return mockListNotebookTemplates();
  }
  if (isApiMockOnly() || shouldUseDemoLocalMock()) {
    return mockListNotebookTemplates();
  }
  const path = `/api/v1/templates?workspace_id=${encodeURIComponent(workspaceId)}`;
  try {
    const rows = await apiFetchJson<BackendQueryTemplate[]>(path, { method: "GET", cache: "no-store" });
    const mapped = Array.isArray(rows) ? rows.map(mapNotebookTemplate) : [];
    return mapped.length ? mapped : mockListNotebookTemplates();
  } catch (e) {
    if (isApiMockFallback() && e instanceof ApiError && (e.status === 401 || e.status === 404 || e.status >= 500)) {
      return mockListNotebookTemplates();
    }
    throw e;
  }
}

export async function quickRunQueryTemplate(
  workspaceId: string,
  templateId: string
): Promise<{ template_id: string; execution_status: string; safe_sql: string; insight: string; chart_type: string }> {
  const qs = new URLSearchParams({ workspace_id: workspaceId });
  return requestJson({
    path: `/api/v1/templates/${encodeURIComponent(templateId)}/run?${qs.toString()}`,
    init: { method: "POST" },
    mock: async () => ({
      template_id: templateId,
      execution_status: "succeeded",
      safe_sql: "SELECT 1",
      insight: "Mock template run",
      chart_type: "line"
    })
  });
}
