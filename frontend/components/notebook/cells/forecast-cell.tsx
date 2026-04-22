import type { ForecastCellProps } from "@/lib/notebook/block-types";

function formatWithSpaces(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmt(n: number | undefined, unit?: string) {
  if (n === undefined) return "—";
  if (unit?.toUpperCase() === "RUB" || unit === "₽") {
    return `${formatWithSpaces(n)} ₽`;
  }
  const s = n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : formatWithSpaces(n);
  return unit ? `${s} ${unit}` : s;
}

export function ForecastCell({ block }: ForecastCellProps) {
  return (
    <div className="surface-decision px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Прогноз</p>
          <h3 className="mt-1 text-heading-3 text-foreground">{block.headline}</h3>
          {block.subtext ? <p className="mt-1 text-sm text-foreground-secondary">{block.subtext}</p> : null}
        </div>
        <span className="rounded-full border border-border-subtle bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-foreground-secondary">
          {block.horizon}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-control border border-border-subtle bg-surface-muted/60 px-3 py-2">
          <p className="text-[11px] font-medium text-foreground-muted">Пессимистичный</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{fmt(block.pessimistic, block.unit)}</p>
        </div>
        <div className="rounded-control border border-brand-200 bg-brand-50 px-3 py-2 shadow-xs">
          <p className="text-[11px] font-medium text-brand-800">Базовый</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-brand-900">{fmt(block.baseline, block.unit)}</p>
        </div>
        <div className="rounded-control border border-border-subtle bg-surface-muted/60 px-3 py-2">
          <p className="text-[11px] font-medium text-foreground-muted">Оптимистичный</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{fmt(block.optimistic, block.unit)}</p>
        </div>
      </div>
    </div>
  );
}
