"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReport,
  createReportSchedule,
  deleteReport,
  fetchNotebookScenarios,
  fetchSavedReports,
  rerunReport
} from "@/lib/api/reports";
import { queryKeys } from "@/hooks/api/query-keys";
import type {
  CreateReportScheduleRequestDto,
  CreateSavedReportRequestDto,
  LegacyCreateReportRequestDto
} from "@/types/api/reports";

export function useSavedReports(workspaceId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.reports.saved(), workspaceId ?? "none"],
    queryFn: () => fetchSavedReports(workspaceId!),
    enabled: Boolean(workspaceId && workspaceId.length >= 8),
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
    mutationFn: (body: CreateSavedReportRequestDto | LegacyCreateReportRequestDto) => createReport(body),
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

export function useCreateReportSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, body }: { reportId: string; body: CreateReportScheduleRequestDto }) =>
      createReportSchedule(reportId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports.all });
    }
  });
}
