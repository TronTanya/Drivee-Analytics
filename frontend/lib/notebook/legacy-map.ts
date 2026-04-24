import type { NotebookCell } from "@/lib/types";
import type { ChartKind, ForecastCombinedPoint, ForecastRecordPoint, NotebookBlock } from "@/lib/notebook/block-types";
import { clarificationReasonSummaryRu } from "@/lib/notebook/clarification-copy";
import type { NotebookCellDto } from "@/types/api/cells";

function tryJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function toJsonString(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function inferForecastUnit(raw: string): string {
  const q = raw.toLowerCase();
  if (
    q.includes("выруч") ||
    q.includes("revenue") ||
    q.includes("price") ||
    q.includes("стоим") ||
    q.includes("rub") ||
    q.includes("₽")
  ) {
    return "RUB";
  }
  if (
    q.includes("заказ") ||
    q.includes("orders") ||
    q.includes("поезд") ||
    q.includes("rides") ||
    q.includes("отмен") ||
    q.includes("cancel")
  ) {
    return "заказов";
  }
  return "ед.";
}

/**
 * Maps API / legacy `NotebookCell` (type + content) into rich `NotebookBlock` for the canvas.
 */
export function legacyCellToBlock(cell: NotebookCell): NotebookBlock {
  const base = { id: cell.id, status: "success" as const };

  switch (cell.type) {
    case "prompt":
      return { ...base, type: "prompt", text: cell.content };
    case "sql":
      return { ...base, type: "sql", sql: cell.content, dialect: "ANSI SQL", validated: true };
    case "clarification":
      {
        const parsed = tryJson<{
          prompt?: string;
          reason_code?: string;
          reasonCode?: string;
          reason_summary_ru?: string;
          reasonSummaryRu?: string;
          options?: Array<{ id: string; label: string }>;
          selected_option_id?: string;
          selectedOptionId?: string;
        }>(cell.content);
        if (parsed) {
          const reasonCode = (parsed.reason_code ?? parsed.reasonCode ?? "").trim() || undefined;
          const fromPayload = (parsed.reason_summary_ru ?? parsed.reasonSummaryRu ?? "").trim();
          const reasonSummaryRu =
            fromPayload || (reasonCode ? clarificationReasonSummaryRu(reasonCode) : undefined);
          return {
            ...base,
            type: "clarification",
            prompt: parsed.prompt ?? cell.content,
            reasonCode,
            reasonSummaryRu,
            options:
              parsed.options && parsed.options.length
                ? parsed.options
                : [
                    { id: "a", label: "Все значения city_id" },
                    { id: "b", label: "city_id = 101" },
                    { id: "c", label: "Топ-5 city_id по отменам" }
                  ],
            selectedOptionId: parsed.selectedOptionId ?? parsed.selected_option_id
          };
        }
      }
      return {
        ...base,
        type: "clarification",
        prompt: cell.content,
        options: [
          { id: "a", label: "Все значения city_id" },
          { id: "b", label: "city_id = 101" },
          { id: "c", label: "Топ-5 city_id по отменам" }
        ]
      };
    case "insight": {
      const raw = cell.content.trim();
      const lines = raw.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      // Один абзац с бэка: не дублируем тот же текст в summary и bullets (раньше было два одинаковых блока в UI).
      if (lines.length <= 1) {
        return {
          ...base,
          type: "insight",
          title: "Инсайт",
          summary: raw.slice(0, 4000),
          bullets: [],
          confidence: 0.82
        };
      }
      return {
        ...base,
        type: "insight",
        title: "Инсайт",
        summary: lines[0]?.slice(0, 220),
        bullets: lines,
        confidence: 0.82
      };
    }
    case "forecast": {
      const asObj = tryJson<Record<string, unknown>>(cell.content);
      if (asObj && typeof asObj === "object" && !Array.isArray(asObj)) {
        const recordsRaw = asObj.records;
        const records = Array.isArray(recordsRaw)
          ? (recordsRaw as ForecastRecordPoint[]).filter(
              (r) => r && typeof r === "object" && typeof (r as ForecastRecordPoint).forecast_value === "number"
            )
          : [];
        const last = records.length ? records[records.length - 1] : undefined;
        if (asObj.schema_version === 1 || records.length > 0) {
          return {
            ...base,
            type: "forecast",
            forecastSource: "pipeline",
            headline: typeof asObj.headline === "string" ? asObj.headline : "Baseline-прогноз по ряду",
            subtext: typeof asObj.subtext === "string" ? asObj.subtext : undefined,
            horizon: typeof asObj.horizon === "string" ? asObj.horizon : "Горизонт не задан",
            baseline:
              typeof last?.forecast_value === "number"
                ? last.forecast_value
                : typeof asObj.baseline === "number"
                  ? asObj.baseline
                  : undefined,
            pessimistic:
              typeof last?.forecast_low === "number"
                ? last.forecast_low
                : typeof asObj.pessimistic === "number"
                  ? asObj.pessimistic
                  : undefined,
            optimistic:
              typeof last?.forecast_high === "number"
                ? last.forecast_high
                : typeof asObj.optimistic === "number"
                  ? asObj.optimistic
                  : undefined,
            unit: typeof asObj.unit === "string" ? asObj.unit : inferForecastUnit(cell.content),
            records: records.length ? records : undefined,
            explanationRu: typeof asObj.explanation_ru === "string" ? asObj.explanation_ru : undefined,
            warningRu:
              typeof asObj.warning_ru === "string"
                ? asObj.warning_ru
                : asObj.warning_ru === null
                  ? null
                  : undefined,
            confidenceScore: typeof asObj.confidence_score === "number" ? asObj.confidence_score : undefined,
            history: Array.isArray(asObj.history) ? (asObj.history as { period: string; value: number }[]) : undefined,
            rSquared: typeof asObj.r_squared === "number" ? asObj.r_squared : undefined,
            metricColumn: typeof asObj.metric_column === "string" ? asObj.metric_column : undefined,
            backtestNoteRu: typeof asObj.backtest_note_ru === "string" ? asObj.backtest_note_ru : undefined,
            timeGrain: typeof asObj.time_grain === "string" ? asObj.time_grain : undefined,
            sourceTableLabel: typeof asObj.source_table_label === "string" ? asObj.source_table_label : undefined,
            combinedSeries: Array.isArray(asObj.combined_series)
              ? (asObj.combined_series as Record<string, unknown>[])
                  .map((p) => {
                    if (!p || typeof p !== "object") return null;
                    const seg = p.segment === "forecast" ? "forecast" : "history";
                    const idx = typeof p.idx === "number" ? p.idx : Number(p.idx);
                    const val = typeof p.value === "number" ? p.value : Number(p.value);
                    const lab = typeof p.label === "string" ? p.label : String(p.label ?? "");
                    if (!Number.isFinite(idx) || !Number.isFinite(val)) return null;
                    return { idx, value: val, segment: seg as "history" | "forecast", label: lab };
                  })
                  .filter((x): x is ForecastCombinedPoint => x !== null)
              : undefined
          };
        }
        const parsed = tryJson<{
          headline?: string;
          subtext?: string;
          horizon?: string;
          baseline?: number;
          optimistic?: number;
          pessimistic?: number;
          unit?: string;
        }>(cell.content);
        if (parsed) {
          return {
            ...base,
            type: "forecast",
            forecastSource: "pipeline",
            headline: parsed.headline ?? "Прогнозный горизонт",
            subtext: parsed.subtext,
            horizon: parsed.horizon ?? "Следующие 8 недель",
            baseline: parsed.baseline,
            optimistic: parsed.optimistic,
            pessimistic: parsed.pessimistic,
            unit: parsed.unit ?? inferForecastUnit(cell.content)
          };
        }
      }
      const legacyRows = tryJson<Array<{ step?: number; forecast_value?: number; forecast_low?: number; forecast_high?: number }>>(
        cell.content
      );
      if (Array.isArray(legacyRows) && legacyRows.length > 0) {
        const last = legacyRows[legacyRows.length - 1]!;
        const recs: ForecastRecordPoint[] = legacyRows.map((r, i) => ({
          step: typeof r.step === "number" ? r.step : i + 1,
          forecast_value: Number(r.forecast_value),
          forecast_low: r.forecast_low !== undefined ? Number(r.forecast_low) : undefined,
          forecast_high: r.forecast_high !== undefined ? Number(r.forecast_high) : undefined
        }));
        return {
          ...base,
          type: "forecast",
          forecastSource: "pipeline",
          headline: "Baseline-прогноз по ряду",
          subtext: "Линейный тренд по SQL-результату (компактный JSON-массив точек).",
          horizon: `Следующие ${legacyRows.length} шаг(ов) ряда`,
          baseline: Number(last.forecast_value),
          pessimistic: last.forecast_low !== undefined ? Number(last.forecast_low) : undefined,
          optimistic: last.forecast_high !== undefined ? Number(last.forecast_high) : undefined,
          unit: inferForecastUnit(cell.content),
          records: recs
        };
      }
      return {
        ...base,
        type: "forecast",
        forecastSource: "pipeline",
        headline: "Прогнозный горизонт",
        subtext: cell.content,
        horizon: "Следующие 8 недель",
        baseline: 128000,
        optimistic: 142000,
        pessimistic: 115000,
        unit: inferForecastUnit(cell.content)
      };
    }
    case "trace":
      {
        const parsed = tryJson<{
          summary?: string;
          interpreted_intent?: string;
          confidence?: number;
          tables_used?: string[];
        }>(cell.content);
        if (parsed) {
          return {
            ...base,
            type: "trace",
            summary: (parsed.summary ?? cell.content ?? "").trim(),
            intent: parsed.interpreted_intent?.trim() || "Интерпретация запроса",
            tables: Array.isArray(parsed.tables_used) ? parsed.tables_used : []
          };
        }
      }
      return {
        ...base,
        type: "trace",
        summary: cell.content,
        intent: "Интерпретация запроса",
        tables: ["orders", "regions"]
      };
    case "table": {
      const parsed = tryJson<{ columns?: string[]; rows?: Record<string, string | number>[]; caption?: string }>(
        cell.content
      );
      if (parsed?.rows && Array.isArray(parsed.rows)) {
        const inferredColumns =
          parsed.columns && parsed.columns.length
            ? parsed.columns
            : parsed.rows.length
              ? Object.keys(parsed.rows[0] ?? {})
              : [];
        return {
          ...base,
          type: "table",
          columns: inferredColumns,
          rows: parsed.rows,
          caption: parsed.caption ?? "Результат SQL-запроса"
        };
      }
      const parsedRowsOnly = tryJson<Array<Record<string, string | number>>>(cell.content);
      if (Array.isArray(parsedRowsOnly)) {
        return {
          ...base,
          type: "table",
          columns: parsedRowsOnly.length ? Object.keys(parsedRowsOnly[0] ?? {}) : [],
          rows: parsedRowsOnly,
          caption: "Результат SQL-запроса"
        };
      }
      return {
        ...base,
        type: "table",
        columns: ["note"],
        rows: [{ note: cell.content }],
        caption: "Неструктурированный табличный вывод"
      };
    }
    case "chart": {
      const parsed = tryJson<{
        chartType?: ChartKind;
        recommended_chart_type?: ChartKind;
        recommendedChartType?: ChartKind;
        alternative_chart_types?: ChartKind[];
        alternativeChartTypes?: ChartKind[];
        visualization_explanation?: string;
        visualizationExplanation?: string;
        geo_metadata?: {
          geo_enabled?: boolean;
          geo_dimension?: string | null;
          map_scope?: string | null;
          fallback_chart_type?: ChartKind | null;
          map_features?: Array<{
            id?: string;
            label?: string;
            value?: number | null;
            lat?: number | null;
            lon?: number | null;
          }>;
        } | null;
        geoMetadata?: {
          geoEnabled?: boolean;
          geoDimension?: string | null;
          mapScope?: string | null;
          fallbackChartType?: ChartKind | null;
          mapFeatures?: Array<{
            id?: string;
            label?: string;
            value?: number | null;
            lat?: number | null;
            lon?: number | null;
          }>;
        } | null;
        title?: string;
        subtitle?: string;
        unitLabel?: string;
        sampleSize?: number;
        qualityMetricLabel?: string;
        qualityMetricValue?: number;
        xKey?: string;
        series?: { key: string; name: string }[];
        data?: Record<string, string | number>[];
      }>(cell.content);
      if (parsed?.data && parsed.xKey && parsed.series?.length) {
        return {
          ...base,
          type: "chart",
          chartType: parsed.chartType ?? "line",
          recommendedChartType:
            parsed.recommendedChartType ?? parsed.recommended_chart_type ?? parsed.chartType ?? "line",
          alternativeChartTypes: parsed.alternativeChartTypes ?? parsed.alternative_chart_types ?? [],
          visualizationExplanation: parsed.visualizationExplanation ?? parsed.visualization_explanation ?? "",
          geoMetadata:
            parsed.geoMetadata ??
            (parsed.geo_metadata
              ? {
                  geoEnabled: parsed.geo_metadata.geo_enabled,
                  geoDimension: parsed.geo_metadata.geo_dimension,
                  mapScope: parsed.geo_metadata.map_scope,
                  fallbackChartType: parsed.geo_metadata.fallback_chart_type,
                  mapFeatures: parsed.geo_metadata.map_features
                }
              : null),
          title: parsed.title,
          subtitle: parsed.subtitle,
          unitLabel: parsed.unitLabel,
          sampleSize: parsed.sampleSize,
          qualityMetricLabel: parsed.qualityMetricLabel,
          qualityMetricValue: parsed.qualityMetricValue,
          xKey: parsed.xKey,
          series: parsed.series,
          data: parsed.data
        };
      }
      return {
        ...base,
        type: "chart",
        chartType: "table",
        recommendedChartType: "table",
        alternativeChartTypes: ["line", "bar", "area"],
        visualizationExplanation:
          "Данные графика в ячейке не в ожидаемом JSON-формате (нет data/xKey/series) — показан пустой fallback. Откройте таблицу результата выше или перезапустите аналитику.",
        geoMetadata: null,
        title: "Визуализация",
        subtitle: "Структура payload не распознана",
        xKey: "label",
        series: [{ key: "value", name: "Значение" }],
        data: []
      };
    }
    default:
      return { ...base, type: "prompt", text: cell.content };
  }
}

export function legacyCellsToBlocks(cells: NotebookCell[]): NotebookBlock[] {
  return cells.map(legacyCellToBlock);
}

export function cellDtoToLegacy(cell: NotebookCellDto): NotebookCell {
  const payloadJson =
    cell.payload && (cell.type === "table" || cell.type === "chart" || cell.type === "clarification" || cell.type === "forecast" || cell.type === "trace")
      ? toJsonString(cell.payload)
      : null;
  return { id: cell.id, type: cell.type, content: payloadJson ?? cell.content };
}

export function cellDtosToBlocks(cells: NotebookCellDto[]): NotebookBlock[] {
  return cells.map((c) => legacyCellToBlock(cellDtoToLegacy(c)));
}
