"use client";

import type { ForecastCellProps } from "@/lib/notebook/block-types";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axisTick = { fill: "#64748b", fontSize: 11 };
const grid = { stroke: "#e2e8f0", strokeDasharray: "3 3" as const };
const palette = ["#18a15f", "#6366f1", "#0ea5e9", "#f59e0b", "#a855f7", "#64748b"];

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

function confidenceLabel(score: number | undefined): string | null {
  if (score === undefined || !Number.isFinite(score)) return null;
  return `${Math.round(score * 100)}% (эвристика)`;
}

const grainLabelRu: Record<string, string> = {
  day: "день",
  week: "неделя",
  month: "месяц"
};

export function ForecastCell({ block }: ForecastCellProps) {
  const conf = confidenceLabel(block.confidenceScore);
  const hist = block.history?.length ? block.history.slice(-8) : [];
  const fcRows = block.records?.length ? block.records.slice(0, 8) : [];
  const combined = (block.combinedSeries ?? []).filter(
    (p) => p && Number.isFinite(p.value) && (p.segment === "history" || p.segment === "forecast")
  );
  const grainRu = block.timeGrain ? grainLabelRu[block.timeGrain] ?? block.timeGrain : null;
  const sourceBadge =
    block.forecastSource === "fallback"
      ? { label: "Источник: DS fallback", className: "border-amber-200 bg-amber-50 text-amber-900" }
      : { label: "Источник: Pipeline", className: "border-emerald-200 bg-emerald-50 text-emerald-900" };

  return (
    <div className="surface-decision px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Прогноз</p>
          <h3 className="mt-1 text-heading-3 text-foreground">{block.headline}</h3>
          {block.subtext ? <p className="mt-1 text-sm text-foreground-secondary">{block.subtext}</p> : null}
          <p className="mt-1 text-xs text-foreground-muted">Срок в бейдже ({block.horizon}) — активный горизонт прогноза.</p>
          {block.metricColumn ? (
            <p className="mt-1 text-xs text-foreground-muted">
              Метрика ряда: <span className="font-mono">{block.metricColumn}</span>
              {block.rSquared != null ? ` · R²≈${block.rSquared}` : null}
              {conf ? ` · Уверенность: ${conf}` : null}
            </p>
          ) : null}
          {grainRu || block.sourceTableLabel ? (
            <p className="mt-1 text-xs text-foreground-muted">
              {grainRu ? <>Гранулярность ряда: {grainRu}</> : null}
              {grainRu && block.sourceTableLabel ? " · " : null}
              {block.sourceTableLabel ? (
                <>
                  Источник: <span className="font-mono">{block.sourceTableLabel}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${sourceBadge.className}`}>
            {sourceBadge.label}
          </span>
          <span className="rounded-full border border-border-subtle bg-surface-muted px-2.5 py-1 text-[11px] font-semibold text-foreground-secondary">
            {block.horizon}
          </span>
        </div>
      </div>
      {block.warningRu ? (
        <div
          className="mt-3 rounded-control border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          <span className="font-semibold">Внимание: </span>
          {block.warningRu}
        </div>
      ) : null}
      {combined.length >= 2 ? (
        <div className="mt-4 rounded-control border border-border-subtle bg-surface-muted/30 px-2 py-3">
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            История и прогноз
          </p>
          <div className="h-[220px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={combined} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid {...grid} />
                <XAxis
                  dataKey="label"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                  formatter={(value: number) => [fmt(value, block.unit), "Значение"]}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as { segment?: string; label?: string } | undefined;
                    const seg = p?.segment === "forecast" ? "прогноз" : "история";
                    return `${p?.label ?? ""} (${seg})`;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name="Ряд"
                  stroke={palette[1]}
                  strokeWidth={2}
                  dot={(props) => {
                    const { cx, cy, payload } = props;
                    const seg = (payload as { segment?: string })?.segment;
                    const fill = seg === "forecast" ? palette[1] : palette[0];
                    if (cx == null || cy == null) return <g />;
                    return <circle cx={cx} cy={cy} r={seg === "forecast" ? 4 : 3} fill={fill} stroke="#fff" strokeWidth={1} />;
                  }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 px-2 text-[11px] text-foreground-muted">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-full" style={{ background: palette[0] }} /> факт
            </span>
            <span className="mx-2 text-foreground-muted">·</span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block size-2 rounded-full" style={{ background: palette[1] }} /> baseline-шаг
            </span>
          </p>
        </div>
      ) : null}
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
      {block.explanationRu ? (
        <p className="mt-4 text-sm leading-relaxed text-foreground-secondary">{block.explanationRu}</p>
      ) : null}
      {combined.length < 2 && (hist.length > 0 || fcRows.length > 0) ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {hist.length > 0 ? (
            <div className="rounded-control border border-border-subtle bg-surface-muted/40 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">История (хвост ряда)</p>
              <ul className="mt-2 space-y-1 font-mono text-[11px] text-foreground-secondary">
                {hist.map((h, i) => (
                  <li key={`${h.period}-${i}`} className="flex justify-between gap-2">
                    <span className="truncate text-foreground-muted">{h.period}</span>
                    <span className="tabular-nums">{h.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {fcRows.length > 0 ? (
            <div className="rounded-control border border-border-subtle bg-surface-muted/40 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Первые шаги прогноза</p>
              <ul className="mt-2 space-y-1 font-mono text-[11px] text-foreground-secondary">
                {fcRows.map((r) => (
                  <li key={r.step} className="flex justify-between gap-2">
                    <span className="text-foreground-muted">Шаг {r.step}</span>
                    <span className="tabular-nums text-foreground">
                      {r.forecast_low != null && r.forecast_high != null
                        ? `${r.forecast_low} … ${r.forecast_value} … ${r.forecast_high}`
                        : String(r.forecast_value)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {block.backtestNoteRu ? (
        <p className="mt-3 text-xs text-foreground-muted">{block.backtestNoteRu}</p>
      ) : null}
    </div>
  );
}
