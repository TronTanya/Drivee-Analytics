"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTrainDatasetSummary } from "@/lib/api/train-dataset-summary";

export function useTrainDatasetSummary(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ["train-dataset-summary", workspaceId ?? ""],
    queryFn: () => fetchTrainDatasetSummary(workspaceId),
    enabled: Boolean(workspaceId?.trim()),
    staleTime: 60_000
  });
}
