"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createReport, deleteReport, fetchNotebookScenarios, fetchSavedReports, rerunReport } from "@/lib/api/reports";
import { queryKeys } from "@/hooks/api/query-keys";
import type { CreateReportRequestDto } from "@/types/api/reports";

export function useSavedReports() {
  return useQuery({
    queryKey: queryKeys.reports.saved(),
    queryFn: fetchSavedReports,
    staleTime: 30_000
  });
}

export function useNotebookScenarios() {
  return useQuery({
    queryKey: queryKeys.reports.scenarios(),
    queryFn: fetchNotebookScenarios,
    staleTime: 30_000
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReportRequestDto) => createReport(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    }
  });
}

export function useRerunReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rerunReport(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    }
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReport(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    }
  });
}
