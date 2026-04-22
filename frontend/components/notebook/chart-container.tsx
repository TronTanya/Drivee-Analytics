"use client";

import type { ReactNode } from "react";
import type { ChartBlock } from "@/lib/notebook/block-types";
import { ChartTypeSwitcher } from "@/components/notebook/chart-type-switcher";

type ChartContainerProps = {
  block: ChartBlock;
  onTypeChange?: (next: ChartBlock["chartType"]) => void;
  body: ReactNode;
};

export function ChartContainer({ block, onTypeChange, body }: ChartContainerProps) {
  const selected = block.chartType;
  const recommended = block.recommendedChartType ?? selected;
  const alternatives = block.alternativeChartTypes ?? [];
  const switched = selected !== recommended;
  const switcherOptions = Array.from(new Set([recommended, ...alternatives, "table"])) as ChartBlock["chartType"][];

  return (
    <section className="space-y-3 rounded-control border border-border-subtle bg-surface-card p-3 shadow-xs">
      <header className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Визуализация</p>
            <p className="text-sm font-semibold text-foreground">{block.title ?? "Chart output"}</p>
          </div>
          <div className="overflow-x-auto">
            {onTypeChange ? <ChartTypeSwitcher value={selected} onChange={onTypeChange} options={switcherOptions} /> : null}
          </div>
        </div>
        <div className="rounded-control border border-border-subtle bg-surface-muted/50 px-3 py-2 text-xs text-foreground-secondary">
          <p>{block.visualizationExplanation || "Тип графика выбран автоматически на основе структуры данных."}</p>
          <p className="mt-1 text-foreground-muted">
            Рекомендация: <span className="font-semibold text-foreground">{recommended}</span>. Вы можете переключить тип вручную.
          </p>
          {switched ? (
            <p className="mt-1 text-brand-700">
              Сейчас выбран <span className="font-semibold">{selected}</span>, автоматическая рекомендация была{" "}
              <span className="font-semibold">{recommended}</span>.
            </p>
          ) : null}
        </div>
      </header>

      <div className="h-[220px] rounded-control border border-border-subtle bg-gradient-to-b from-surface-card to-surface-muted/35 p-2.5 sm:h-[280px]">
        {body}
      </div>

      {block.geoMetadata?.geoEnabled ? (
        <footer className="rounded-control border border-border-subtle bg-surface-muted/40 px-3 py-2 text-xs text-foreground-secondary">
          <span className="font-semibold text-foreground">Geo mode</span> · dimension:{" "}
          <span className="font-mono">{block.geoMetadata.geoDimension ?? "—"}</span> · scope:{" "}
          <span className="font-mono">{block.geoMetadata.mapScope ?? "auto"}</span> · fallback:{" "}
          <span className="font-mono">{block.geoMetadata.fallbackChartType ?? "horizontal_bar"}</span>
        </footer>
      ) : null}
    </section>
  );
}
