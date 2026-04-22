"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSchedules, upsertSchedule } from "@/lib/api/schedules";
import { queryKeys } from "@/hooks/api/query-keys";
import type { UpsertScheduleRequestDto } from "@/types/api/schedules";

export function useSchedules() {
  return useQuery({
    queryKey: queryKeys.schedules.list(),
    queryFn: fetchSchedules,
    staleTime: 30_000
  });
}

export function useUpsertSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertScheduleRequestDto & { id?: string }) => upsertSchedule(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.schedules.all });
    }
  });
}
