import { runNotebookAnalytics } from "@/lib/api/cells";
import type { RunNotebookAnalyticsResponseDto } from "@/types/api/cells";

/** Back-compat: `(notebookId, prompt)` signature used by notebook UI */
export async function runAnalyticsPipeline(
  notebookId: string,
  prompt: string
): Promise<RunNotebookAnalyticsResponseDto> {
  return runNotebookAnalytics({ notebook_id: notebookId, prompt });
}
