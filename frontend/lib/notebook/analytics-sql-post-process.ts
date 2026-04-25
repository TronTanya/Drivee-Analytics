import type { RunNotebookAnalyticsResponseDto } from "@/types/api/cells";

export const ANALYTICS_FORECAST_INSUFFICIENT_RU = "Недостаточно данных для прогноза";

export type AnalyticsSqlPostProcessSnapshot = {
  insights: string[];
  forecast: Record<string, unknown>;
  anomalies: Record<string, unknown>[];
};

/** Нормализует поля post-SQL analytics для UI (в т.ч. ответы старых backend без forecast). */
export function snapshotAnalyticsSqlPostProcess(resp: RunNotebookAnalyticsResponseDto): AnalyticsSqlPostProcessSnapshot {
  const insights = Array.isArray(resp.insights)
    ? resp.insights.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const raw =
    resp.forecast && typeof resp.forecast === "object" && !Array.isArray(resp.forecast)
      ? ({ ...resp.forecast } as Record<string, unknown>)
      : {};
  const sufficient = raw.sufficient_data === true;
  const note =
    typeof raw.note_ru === "string" && raw.note_ru.trim()
      ? raw.note_ru.trim()
      : sufficient
        ? ""
        : ANALYTICS_FORECAST_INSUFFICIENT_RU;
  const forecast: Record<string, unknown> = {
    ...raw,
    sufficient_data: sufficient,
    note_ru: note
  };

  const anomalies = Array.isArray(resp.anomalies)
    ? resp.anomalies.filter((a): a is Record<string, unknown> => !!a && typeof a === "object" && !Array.isArray(a))
    : [];

  return { insights, forecast, anomalies };
}
