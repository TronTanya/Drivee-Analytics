import { requestJson } from "@/lib/api/request";
import { mockListNotebookTemplates, mockListQueryTemplates } from "@/lib/api/mocks";
import type { NotebookTemplateDto, QueryTemplateDto } from "@/types/api/templates";

export async function fetchQueryTemplates(): Promise<QueryTemplateDto[]> {
  return requestJson({
    path: "/api/v1/templates/queries",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListQueryTemplates()
  });
}

export async function fetchNotebookTemplates(): Promise<NotebookTemplateDto[]> {
  return requestJson({
    path: "/api/v1/templates/notebooks",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListNotebookTemplates()
  });
}

export async function quickRunQueryTemplate(templateId: string): Promise<{ notebook_id: string }> {
  return requestJson({
    path: `/api/v1/templates/queries/${encodeURIComponent(templateId)}/run`,
    init: { method: "POST" },
    mock: async () => ({ notebook_id: "nb-from-template" })
  });
}
