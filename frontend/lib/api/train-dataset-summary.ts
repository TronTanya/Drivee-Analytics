import { apiFetchJson, ApiError } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";
import { mockTrainDatasetSummary } from "@/lib/api/mocks";
import type { TrainDatasetSummaryDto } from "@/types/api/train-dataset";

export async function fetchTrainDatasetSummary(workspaceId: string | undefined): Promise<TrainDatasetSummaryDto | null> {
  if (isApiMockOnly()) {
    return mockTrainDatasetSummary();
  }
  if (!workspaceId?.trim()) {
    return null;
  }
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/dashboards/train-summary`;
  try {
    return await apiFetchJson<TrainDatasetSummaryDto>(path, { method: "GET", cache: "no-store" });
  } catch (e) {
    if (
      isApiMockFallback() &&
      (e instanceof TypeError ||
        (e instanceof ApiError && (e.status >= 500 || e.status === 404 || e.status === 401 || e.status === 403)))
    ) {
      return mockTrainDatasetSummary();
    }
    throw e;
  }
}
