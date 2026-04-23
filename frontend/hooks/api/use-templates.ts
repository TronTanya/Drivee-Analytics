"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchNotebookTemplates, fetchQueryTemplates, quickRunQueryTemplate } from "@/lib/api/templates";
import { queryKeys } from "@/hooks/api/query-keys";

export function useQueryTemplates(workspaceId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.templates.queries(), workspaceId ?? "none"],
    queryFn: () => fetchQueryTemplates(workspaceId!),
    enabled: Boolean(workspaceId && workspaceId.length >= 8),
    staleTime: 60_000
  });
}

export function useNotebookTemplates() {
  return useQuery({
    queryKey: queryKeys.templates.notebooks(),
    queryFn: fetchNotebookTemplates,
    staleTime: 60_000
  });
}

export function useQuickRunQueryTemplate() {
  return useMutation({
    mutationFn: ({ workspaceId, templateId }: { workspaceId: string; templateId: string }) =>
      quickRunQueryTemplate(workspaceId, templateId)
  });
}
