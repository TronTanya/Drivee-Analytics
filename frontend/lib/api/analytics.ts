import { runNotebookAnalytics } from "@/lib/api/cells";
import type { NotebookAnalyticsRunOptions, RunNotebookAnalyticsResponseDto } from "@/types/api/cells";

/** Запуск analytics с опциональными флагами оркестратора (trace-панель, пагинация). */
export async function runAnalyticsPipeline(
  notebookId: string,
  prompt: string,
  options?: NotebookAnalyticsRunOptions
): Promise<RunNotebookAnalyticsResponseDto> {
  return runNotebookAnalytics({
    notebook_id: notebookId,
    prompt,
    ...options
  });
}
