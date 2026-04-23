import type { ChartKind } from "@/lib/notebook/block-types";

const CHART_KINDS: readonly ChartKind[] = [
  "line",
  "bar",
  "area",
  "horizontal_bar",
  "stacked_bar",
  "combo",
  "pie",
  "donut",
  "scatter",
  "radar",
  "heatmap",
  "geo_bubble",
  "map",
  "histogram",
  "table"
] as const;

export function isChartKind(value: string): value is ChartKind {
  return (CHART_KINDS as readonly string[]).includes(value);
}

/** Нормализация значений chart_type с бэка / LLM. */
export function normalizeChartKind(raw: string | undefined | null): ChartKind | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/-/g, "_");
  if (isChartKind(s)) return s;
  const aliases: Record<string, ChartKind> = {
    column: "bar",
    columns: "bar",
    bar_chart: "bar",
    line_chart: "line",
    time_series: "line",
    timeseries: "line",
    pie_chart: "pie",
    donut_chart: "donut",
    h_bar: "horizontal_bar",
    horizontal: "horizontal_bar",
    geo: "map"
  };
  return aliases[s] ?? null;
}

/**
 * Автовыбор визуализации по тексту намерения / SQL (MVP-эвристики).
 * Порядок: география → доли → рейтинг → сравнение категорий → динамика.
 */
export function inferChartKindFromIntentText(text: string): ChartKind | null {
  const t = text.toLowerCase();
  if (
    /\b(geo|гео|картограф|карт\b|map\b|координ|latitude|longitude|широт|долгот|geom)\b/.test(t) ||
    (/\b(город|city)\b/.test(t) && /\b(карт|map|geo)\b/.test(t))
  ) {
    return "map";
  }
  if (
    /\b(дол[яи]|долей|share|процент|parts?\s+of|pie|donut|ring)\b/.test(t) ||
    /\bот\s+общ(его|ей)\b/.test(t) ||
    /%\s*от\b/.test(t)
  ) {
    return "donut";
  }
  if (/\b(рейтинг|ranking|топ\b|top\s*\d|leaderboard|лидер)\b/.test(t)) {
    return "horizontal_bar";
  }
  if (
    /\b(сравн|comparison|\bvs\b|категор|столбц|bar_chart|bar\s+chart|по\s+город)\b/.test(t) ||
    /\bgroup\s+by\b/.test(t)
  ) {
    return "bar";
  }
  if (
    /\b(динамик|trend|временн|time\s*series|по\s+дням|недел|месяц|week|daily|interval|forecast|прогноз)\b/.test(t) ||
    /\b(date_trunc|generate_series)\b/.test(t)
  ) {
    return "line";
  }
  return null;
}

export function resolveAutoChartKind(trace: {
  interpretedIntent: string;
  generatedSql: string;
  chartRecommendation: { chartType: string; alternatives?: string[] };
}): ChartKind {
  const haystack = `${trace.interpretedIntent}\n${trace.generatedSql}`;
  const fromIntent = inferChartKindFromIntentText(haystack);
  if (fromIntent) return fromIntent;
  const fromRec = normalizeChartKind(trace.chartRecommendation.chartType);
  if (fromRec && fromRec !== "table") return fromRec;
  if (fromRec === "table") return "line";
  return "line";
}
