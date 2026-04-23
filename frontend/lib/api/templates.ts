import { ApiError, apiFetchJson } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";
import { requestJson } from "@/lib/api/request";
import { mockListNotebookTemplates, mockListQueryTemplates } from "@/lib/api/mocks";
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
  is_system: boolean;
};

function mapQueryTemplate(r: BackendQueryTemplate): QueryTemplateDto {
  return {
    id: r.id,
    name: r.template_name,
    description: r.description ?? "",
    role: "manager",
    sql: (r.sql_template && r.sql_template.trim()) || r.nl_prompt_template,
    default_notebook_id: undefined,
    template_key: r.template_key,
    nl_prompt_template: r.nl_prompt_template,
    sql_template: r.sql_template ?? null,
    default_chart_type: r.default_chart_type ?? undefined
  };
}

export async function fetchQueryTemplates(workspaceId: string): Promise<QueryTemplateDto[]> {
  if (isApiMockOnly()) {
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

export async function fetchNotebookTemplates(): Promise<NotebookTemplateDto[]> {
  return requestJson({
    path: "/api/v1/templates/notebooks",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListNotebookTemplates()
  });
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
