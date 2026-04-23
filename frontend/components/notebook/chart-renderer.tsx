"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { ChartBlock } from "@/lib/notebook/block-types";

const axisTick = { fill: "#64748b", fontSize: 11 };
const grid = { stroke: "#e2e8f0", strokeDasharray: "3 3" as const };
const palette = ["#18a15f", "#6366f1", "#0ea5e9", "#f59e0b", "#a855f7", "#64748b"];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeNumeric(value: unknown): number | null {
  if (isFiniteNumber(value)) return value;
  if (typeof value === "string") {
    const num = Number(value.replace(",", "."));
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function HeatmapFallback({ block }: { block: ChartBlock }) {
  const metric = block.series[0]?.key;
  if (!metric) {
    return <p className="text-sm text-foreground-muted">Недостаточно данных для heatmap.</p>;
  }
  const values = block.data.map((row) => normalizeNumeric(row[metric]) ?? 0);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {block.data.slice(0, 24).map((row, idx) => {
        const value = normalizeNumeric(row[metric]) ?? 0;
        const ratio = (value - min) / span;
        const alpha = 0.1 + ratio * 0.75;
        return (
          <div key={idx} className="rounded-control border border-border-subtle p-2 text-xs">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="truncate font-medium text-foreground">{String(row[block.xKey] ?? "—")}</span>
              <span className="tabular-nums text-foreground-secondary">{value.toFixed(1)}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-muted">
              <div
                className="h-2 rounded-full"
                style={{ width: `${Math.max(8, ratio * 100)}%`, backgroundColor: `rgba(24,161,95,${alpha})` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MapPlaceholder({ block }: { block: ChartBlock }) {
  const metric = block.series[0]?.key;
  const labelKey = block.xKey;
  const sorted = [...block.data]
    .map((row) => ({
      row,
      v: metric ? normalizeNumeric(row[metric]) ?? 0 : 0
    }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 8);
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="rounded-xl border border-dashed border-brand-200/80 bg-gradient-to-br from-brand-50/90 via-surface-card to-slate-50/80 px-4 py-5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-800">Карта (MVP)</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-foreground-secondary">
          Интерактивная карта появится в следующей версии. Ниже — рейтинг локаций по выбранной метрике (тот же результат,
          что и для операционных решений).
        </p>
      </div>
      <div className="rounded-control border border-border-subtle bg-surface-muted/40 px-3 py-2 text-[11px] text-foreground-secondary">
        <span className="font-semibold text-foreground">Geo</span>
        {block.geoMetadata?.geoDimension ? (
          <>
            {" "}
            · измерение <span className="font-mono text-foreground">{block.geoMetadata.geoDimension}</span>
          </>
        ) : null}
        {block.geoMetadata?.mapScope ? (
          <>
            {" "}
            · охват <span className="font-mono text-foreground">{block.geoMetadata.mapScope}</span>
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Рейтинг по метрике</p>
        {sorted.length === 0 ? (
          <p className="text-sm text-foreground-muted">Нет строк для отображения.</p>
        ) : (
          sorted.map(({ row, v }, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-2 rounded-control border border-border-subtle bg-surface-card px-2.5 py-1.5 text-xs shadow-xs"
            >
              <span className="truncate font-medium text-foreground">
                <span className="tabular-nums text-foreground-muted">{idx + 1}.</span> {String(row[labelKey] ?? "—")}
              </span>
              <span className="shrink-0 tabular-nums font-semibold text-brand-800">{metric ? v.toLocaleString("ru-RU") : "—"}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TableFallback({ block }: { block: ChartBlock }) {
  const cols = [block.xKey, ...block.series.map((s) => s.key)];
  return (
    <div className="overflow-x-auto rounded-control border border-border-subtle bg-surface-card">
      <table className="w-full min-w-[360px] text-left text-body-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-surface-muted/70">
            {cols.map((col) => (
              <th key={col} className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-secondary">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.data.slice(0, 30).map((row, idx) => (
            <tr key={idx} className="border-b border-border-subtle/70 last:border-0">
              {cols.map((col) => (
                <td key={col} className="whitespace-nowrap px-3 py-2 text-foreground">
                  {String(row[col] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartRenderer({ block }: { block: ChartBlock }) {
  const scatterY = block.series[0]?.key;
  const comboBar = block.series[0]?.key;
  const comboLine = block.series[1]?.key;
  const pieMetric = block.series[0]?.key;
  const isDonut = block.chartType === "donut";

  if (block.chartType === "table") {
    return <TableFallback block={block} />;
  }
  if (block.chartType === "heatmap") {
    return <HeatmapFallback block={block} />;
  }
  if (block.chartType === "map") {
    return <MapPlaceholder block={block} />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {block.chartType === "horizontal_bar" ? (
        <BarChart data={block.data} layout="vertical" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} horizontal={false} />
          <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis dataKey={block.xKey} type="category" tick={axisTick} axisLine={false} tickLine={false} width={90} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {block.series.map((s, index) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={palette[index % palette.length]} radius={[0, 6, 6, 0]} />
          ))}
        </BarChart>
      ) : block.chartType === "stacked_bar" ? (
        <BarChart data={block.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey={block.xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {block.series.map((s, index) => (
            <Bar key={s.key} stackId="stack-1" dataKey={s.key} name={s.name} fill={palette[index % palette.length]} />
          ))}
        </BarChart>
      ) : block.chartType === "bar" || block.chartType === "histogram" || block.chartType === "geo_bubble" ? (
        <BarChart data={block.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey={block.xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {block.series.map((s, index) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={palette[index % palette.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      ) : block.chartType === "area" ? (
        <AreaChart data={block.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey={block.xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {block.series.map((s, index) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={palette[index % palette.length]}
              fill={palette[index % palette.length]}
              fillOpacity={0.14}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      ) : block.chartType === "combo" ? (
        <ComposedChart data={block.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey={block.xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {comboBar ? <Bar dataKey={comboBar} name={comboBar} fill={palette[0]} radius={[4, 4, 0, 0]} /> : null}
          {comboLine ? <Line type="monotone" dataKey={comboLine} name={comboLine} stroke={palette[1]} strokeWidth={2} dot={false} /> : null}
        </ComposedChart>
      ) : block.chartType === "pie" || block.chartType === "donut" ? (
        <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Pie data={block.data} dataKey={pieMetric} nameKey={block.xKey} cx="50%" cy="50%" outerRadius={78} innerRadius={isDonut ? 44 : 0}>
            {block.data.map((_, idx) => (
              <Cell key={`pie-${idx}`} fill={palette[idx % palette.length]} />
            ))}
          </Pie>
        </PieChart>
      ) : block.chartType === "scatter" ? (
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey={block.xKey} type="number" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis dataKey={scatterY} type="number" tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {scatterY ? <Scatter data={block.data} fill={palette[0]} /> : null}
        </ScatterChart>
      ) : block.chartType === "radar" ? (
        <RadarChart data={block.data} outerRadius="70%">
          <PolarGrid />
          <PolarAngleAxis dataKey={block.xKey} tick={{ fill: "#64748b", fontSize: 11 }} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {block.series.map((s, index) => (
            <Radar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stroke={palette[index % palette.length]}
              fill={palette[index % palette.length]}
              fillOpacity={0.15}
            />
          ))}
        </RadarChart>
      ) : (
        <LineChart data={block.data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey={block.xKey} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {block.series.map((s, index) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={palette[index % palette.length]} strokeWidth={2} dot={false} />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
