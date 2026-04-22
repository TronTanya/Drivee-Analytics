import type { NotebookCell } from "@/lib/types";
import type { ChartKind, NotebookBlock } from "@/lib/notebook/block-types";
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
          options?: Array<{ id: string; label: string }>;
          selected_option_id?: string;
          selectedOptionId?: string;
        }>(cell.content);
        if (parsed) {
          return {
            ...base,
            type: "clarification",
            prompt: parsed.prompt ?? cell.content,
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
      const lines = cell.content.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      return {
        ...base,
        type: "insight",
        title: "Инсайт",
        summary: lines[0]?.slice(0, 220),
        bullets: lines.length ? lines : [cell.content],
        confidence: 0.82
      };
    }
    case "forecast":
      {
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
      return {
        ...base,
        type: "forecast",
        headline: "Прогнозный горизонт",
        subtext: cell.content,
        horizon: "Следующие 8 недель",
        baseline: 128000,
        optimistic: 142000,
        pessimistic: 115000,
        unit: inferForecastUnit(cell.content)
      };
    case "trace":
      return {
        ...base,
        type: "trace",
        summary: cell.content,
        intent: "Аналитическое намерение из модели",
        tables: ["orders", "regions"]
      };
    case "table": {
      const parsed = tryJson<{ columns: string[]; rows: Record<string, string | number>[]; caption?: string }>(
        cell.content
      );
      if (parsed?.columns && parsed.rows) {
        return { ...base, type: "table", ...parsed };
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
        } | null;
        geoMetadata?: {
          geoEnabled?: boolean;
          geoDimension?: string | null;
          mapScope?: string | null;
          fallbackChartType?: ChartKind | null;
        } | null;
        title?: string;
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
                  fallbackChartType: parsed.geo_metadata.fallback_chart_type
                }
              : null),
          title: parsed.title,
          xKey: parsed.xKey,
          series: parsed.series,
          data: parsed.data
        };
      }
      return {
        ...base,
        type: "chart",
        chartType: "line",
        recommendedChartType: "line",
        alternativeChartTypes: ["area", "bar", "table"],
        visualizationExplanation: "Для динамики по времени выбран линейный график.",
        geoMetadata: null,
        title: "Серия",
        xKey: "week",
        series: [
          { key: "orders", name: "Заказы" },
          { key: "done", name: "Завершенные поездки" }
        ],
        data: [
          { week: "W1", orders: 120, done: 118 },
          { week: "W2", orders: 132, done: 125 },
          { week: "W3", orders: 128, done: 123 },
          { week: "W4", orders: 141, done: 132 }
        ]
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
