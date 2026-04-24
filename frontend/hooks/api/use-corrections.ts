"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCorrection, fetchCorrections, updateCorrectionStatus } from "@/lib/api/corrections";
import { queryKeys } from "@/hooks/api/query-keys";
import type { CorrectionDto, CreateCorrectionRequestDto } from "@/types/api/corrections";

export function useCorrections(workspaceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.corrections.list(workspaceId),
    queryFn: () => fetchCorrections(workspaceId),
    enabled: Boolean(workspaceId && workspaceId.length >= 8),
    staleTime: 30_000
  });
}

export function useCreateCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCorrectionRequestDto) => createCorrection(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.corrections.all });
    }
  });
}

export function useUpdateCorrectionStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CorrectionDto["status"] }) =>
      updateCorrectionStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.corrections.all });
    }
  });
}
