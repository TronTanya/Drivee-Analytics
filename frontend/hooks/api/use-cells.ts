"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  appendNotebookCell,
  fetchNotebookCells,
  runNotebookAnalytics,
  runNotebookCell
} from "@/lib/api/cells";
import { queryKeys } from "@/hooks/api/query-keys";
import type { AppendCellRequestDto, RunCellRequestDto, RunNotebookAnalyticsRequestDto } from "@/types/api/cells";

export function useNotebookCells(notebookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.notebooks.cells(notebookId ?? ""),
    queryFn: () => fetchNotebookCells(notebookId!),
    enabled: Boolean(notebookId),
    staleTime: 15_000
  });
}

export function useAppendCell(notebookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: AppendCellRequestDto) => appendNotebookCell(notebookId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notebooks.cells(notebookId) });
    }
  });
}

export function useRunCell(notebookId: string, cellId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: RunCellRequestDto) => runNotebookCell(notebookId, cellId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notebooks.cells(notebookId) });
    }
  });
}

export function useRunNotebookAnalytics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RunNotebookAnalyticsRequestDto) => runNotebookAnalytics(body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.notebooks.cells(vars.notebook_id) });
    }
  });
}
