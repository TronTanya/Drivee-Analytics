"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchNotebookRuns,
  fetchQueryHistory,
  rerunNotebookRun,
  saveRunAsReport
} from "@/lib/api/history";
import { queryKeys } from "@/hooks/api/query-keys";
import type { QueryHistoryFilters } from "@/types/api/history";

export function useNotebookRuns(workspaceId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.history.notebookRuns(), workspaceId ?? "none"],
    queryFn: () => fetchNotebookRuns(workspaceId!),
    enabled: Boolean(workspaceId && workspaceId.length >= 8),
    staleTime: 20_000
  });
}

export function useQueryHistory(workspaceId: string | undefined, filters: QueryHistoryFilters = {}) {
  return useQuery({
    queryKey: [...queryKeys.history.queries(), workspaceId ?? "none", JSON.stringify(filters)],
    queryFn: () => fetchQueryHistory(workspaceId!, filters),
    enabled: Boolean(workspaceId && workspaceId.length >= 8),
    staleTime: 20_000
  });
}

export function useRerunNotebookRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => rerunNotebookRun(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.history.all });
    }
  });
}

export function useSaveRunAsReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, name }: { runId: string; name: string }) => saveRunAsReport(runId, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.history.all });
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    }
  });
}
