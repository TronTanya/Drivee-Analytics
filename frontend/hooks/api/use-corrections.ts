"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCorrection, fetchCorrections, updateCorrectionStatus } from "@/lib/api/corrections";
import { queryKeys } from "@/hooks/api/query-keys";
import type { CorrectionDto, UpsertCorrectionDto } from "@/types/api/corrections";

export function useCorrections() {
  return useQuery({
    queryKey: queryKeys.corrections.list(),
    queryFn: fetchCorrections,
    staleTime: 30_000
  });
}

export function useCreateCorrection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertCorrectionDto) => createCorrection(body),
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
