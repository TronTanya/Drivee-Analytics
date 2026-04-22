import type { KpiMetric } from "@/lib/dashboard/mock-data";

export function KpiStatCard({ metric }: { metric: KpiMetric }) {
  const deltaColor =
    metric.deltaPositive === undefined
      ? "text-foreground-secondary"
      : metric.deltaPositive
        ? "text-emerald-700"
        : "text-rose-700";

  return (
    <article className="rounded-card border border-border-subtle bg-surface-card p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-brand-200/80 hover:shadow-soft">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{metric.label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{metric.value}</p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
        {metric.sub ? <span className="text-foreground-secondary">{metric.sub}</span> : null}
        {metric.delta ? <span className={`font-semibold tabular-nums ${deltaColor}`}>{metric.delta}</span> : null}
      </div>
    </article>
  );
}
