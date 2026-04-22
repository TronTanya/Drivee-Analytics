"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchNotebookTemplates, fetchQueryTemplates, quickRunQueryTemplate } from "@/lib/api/templates";
import { queryKeys } from "@/hooks/api/query-keys";

export function useQueryTemplates() {
  return useQuery({
    queryKey: queryKeys.templates.queries(),
    queryFn: fetchQueryTemplates,
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
    mutationFn: (templateId: string) => quickRunQueryTemplate(templateId)
  });
}
