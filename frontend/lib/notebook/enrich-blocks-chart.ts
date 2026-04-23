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
 * После стабилизации сценария: единый автовыбор типа графика по trace + намерению.
 * Ручной override в UI меняет `chartType` у блока; при следующем запуске pipeline значение снова придёт из API.
 */
export function enrichBlocksWithAutoChart(blocks: NotebookBlock[], trace: TracePanelModel): NotebookBlock[] {
  const auto = resolveAutoChartKind(trace);
  const rec = normalizeChartKind(trace.chartRecommendation.chartType) ?? auto;
  return blocks.map((b) => {
    if (b.type !== "chart") return b;
    const block = b as ChartBlock;
    const alts = uniqueChartKinds([
      ...(block.alternativeChartTypes ?? []),
      ...(trace.chartRecommendation.alternatives ?? []),
      auto,
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
    if (auto === "map" && !geo?.geoEnabled) {
      geo = {
        geoEnabled: true,
        geoDimension: "city_id",
        mapScope: "regional",
        fallbackChartType: "horizontal_bar"
      };
    }
    return {
      ...block,
      chartType: auto,
      recommendedChartType: rec,
      alternativeChartTypes: alts,
      visualizationExplanation: rationale,
      geoMetadata: geo ?? null
    };
  });
}
