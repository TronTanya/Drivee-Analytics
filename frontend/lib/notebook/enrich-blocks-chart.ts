import type { ChartBlock, ChartKind, NotebookBlock, TracePanelModel } from "@/lib/notebook/block-types";
import { normalizeChartKind, resolveAutoChartKind } from "@/lib/notebook/chart-intent-map";

function uniqueChartKinds(raw: Array<string | undefined | null>): ChartKind[] {
  const out: ChartKind[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item) continue;
    const k = normalizeChartKind(item);
    if (!k) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

/**
 * После стабилизации: тип графика из trace (бэкенд: intent + схема результата).
 * Если пользователь уже выбрал другой тип, чем последняя «рекомендация» в блоке — сохраняем выбор.
 */
export function enrichBlocksWithAutoChart(blocks: NotebookBlock[], trace: TracePanelModel): NotebookBlock[] {
  const backendPrimary = resolveAutoChartKind(trace);
  const rec = normalizeChartKind(trace.chartRecommendation.chartType) ?? backendPrimary;
  return blocks.map((b) => {
    if (b.type !== "chart") return b;
    const block = b as ChartBlock;
    const prevRec = block.recommendedChartType != null ? normalizeChartKind(block.recommendedChartType) : null;
    const prevType = normalizeChartKind(block.chartType);
    const userPickedDifferentFromRec =
      prevType != null && prevRec != null && prevType !== prevRec;
    const chartType = userPickedDifferentFromRec ? prevType : backendPrimary;
    const alts = uniqueChartKinds([
      ...(block.alternativeChartTypes ?? []),
      ...(trace.chartRecommendation.alternatives ?? []),
      backendPrimary,
      rec,
      "line",
      "bar",
      "horizontal_bar",
      "donut",
      "table",
      "map"
    ]);
    const rationale =
      block.visualizationExplanation?.trim() ||
      trace.chartRecommendation.rationale?.trim() ||
      "Тип графика выбран автоматически по намерению запроса и подсказке модели.";
    let geo = block.geoMetadata;
    if (chartType === "map" && !geo?.geoEnabled) {
      geo = {
        geoEnabled: true,
        geoDimension: "city_id",
        mapScope: "regional",
        fallbackChartType: "table"
      };
    }
    return {
      ...block,
      chartType,
      recommendedChartType: rec,
      alternativeChartTypes: alts,
      visualizationExplanation: rationale,
      geoMetadata: geo ?? null
    };
  });
}
