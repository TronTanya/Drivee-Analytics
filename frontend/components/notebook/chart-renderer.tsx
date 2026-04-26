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
import { sqlColumnLabelRu } from "@/lib/notebook/sql-column-labels";
import { UiStateSurface } from "@/components/ui/state-surface";

const axisTick = { fill: "#64748b", fontSize: 11 };
const grid = { stroke: "#e2e8f0", strokeDasharray: "3 3" as const };
const palette = ["#18a15f", "#6366f1", "#0ea5e9", "#f59e0b", "#a855f7", "#64748b"];

const chartMargins = { top: 12, right: 16, left: 4, bottom: 8 };
const yAxisWidth = 58;

function displayColumnName(col: string): string {
  return sqlColumnLabelRu(col);
}

/** Ось X по городам / сегментам — не числовая шкала, а категории. */
function isCityLikeXKey(xKey: string): boolean {
  const lo = (xKey || "").toLowerCase();
  return lo === "city_id" || lo === "city" || lo === "dim";
}

/** Подпись оси X: короткая дата для bucket / ISO-строк; города — «Город N». */
function formatXAxisTick(raw: unknown, xKey: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  if (isCityLikeXKey(xKey) && /^\d+$/.test(s)) {
    return `Город ${s}`;
  }
  if (xKey === "bucket" || /^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [, m, day] = d.split("-");
      return `${day}.${m}`;
    }
  }
  if (xKey === "_metric_label" && s.length > 22) {
    return `${s.slice(0, 20)}…`;
  }
  return s.length > 16 ? `${s.slice(0, 14)}…` : s;
}

/** Подпись оси Y: компактно по-русски (тыс / млн) без потери порядка величин. */
function formatYAxisTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  try {
    return new Intl.NumberFormat("ru-RU", {
      notation: "compact",
      maximumFractionDigits: 2,
      compactDisplay: "short"
    }).format(v);
  } catch {
    const a = Math.abs(v);
    if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
    if (a >= 10_000) return `${(v / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс`;
    return Math.round(v).toLocaleString("ru-RU");
  }
}

function formatTooltipValue(value: unknown): string {
  const n = normalizeNumeric(value);
  if (n === null) return String(value ?? "—");
  return Number.isInteger(n) ? n.toLocaleString("ru-RU") : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

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

function normalizeBiTripletShape(block: ChartBlock): ChartBlock {
  if (block.chartType === "table") return block;
  const rows = Array.isArray(block.data) ? block.data : [];
  if (!rows.length) return block;
  const first = rows[0] ?? {};
  const cols = Object.keys(first);
  const hasTriplet = cols.includes("bucket") && cols.includes("dim") && cols.includes("value");
  if (!hasTriplet) return block;

  const dimToken = (r: (typeof rows)[0]) => {
    const d = String((r as Record<string, unknown>).dim ?? "").trim();
    if (!d || d === "null" || d === "undefined") return "";
    return d;
  };
  const distinctDims = new Set(rows.map(dimToken).filter((d) => d.length > 0));
  // Один срез (пустой/одинаковый dim) — не разворачиваем в «города», а простой ряд bucket → value.
  if (distinctDims.size <= 1) {
    const sorted = [...rows]
      .filter((r) => (r as Record<string, unknown>).bucket != null && String((r as Record<string, unknown>).bucket).length > 0)
      .sort((a, b) => String((a as Record<string, unknown>).bucket).localeCompare(String((b as Record<string, unknown>).bucket)));
    if (sorted.length) {
      return {
        ...block,
        xKey: "bucket",
        series: [{ key: "value", name: displayColumnName("value") }],
        data: sorted.map((r) => {
          const rec = r as Record<string, unknown>;
          return {
            bucket: String(rec.bucket),
            value: normalizeNumeric(rec.value) ?? Number(rec.value ?? 0)
          };
        }),
        visualizationExplanation:
          block.visualizationExplanation ||
          "Ряд по датам: одно значение на период (без разворота по городу)."
      };
    }
  }

  // Старый payload мог приходить как x=bucket, series=[{key:"dim"}], где y рисовался по city_id.
  // Перестраиваем в BI-вид: X = bucket, series = city_id, Y = value.
  const xOrder: string[] = [];
  const seriesOrder: string[] = [];
  const matrix = new Map<string, Record<string, string | number>>();

  for (const row of rows) {
    const x = String(row.bucket ?? "");
    const s = String(row.dim ?? "");
    if (!x || !s) continue;
    if (!matrix.has(x)) {
      matrix.set(x, { bucket: x });
      xOrder.push(x);
    }
    if (!seriesOrder.includes(s)) seriesOrder.push(s);
    const point = matrix.get(x)!;
    point[s] = normalizeNumeric(row.value) ?? Number(row.value ?? 0);
  }

  if (!xOrder.length || !seriesOrder.length) return block;
  return {
    ...block,
    xKey: "bucket",
    series: seriesOrder.slice(0, 12).map((s) => ({ key: s, name: `Город ${s}` })),
    data: xOrder.map((x) => matrix.get(x)!).filter(Boolean),
    visualizationExplanation:
      block.visualizationExplanation ||
      "Данные автоматически нормализованы в формат: дата × город × количество.",
  };
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
        {Array.isArray(block.geoMetadata?.mapFeatures) && (block.geoMetadata?.mapFeatures?.length ?? 0) > 0 ? (
          <>
            {" "}
            · объектов для карты:{" "}
            <span className="font-mono text-foreground">{block.geoMetadata?.mapFeatures?.length}</span>
          </>
        ) : null}
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
                {displayColumnName(col)}
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
  const chartBlock = normalizeBiTripletShape(block);
  const scatterY = chartBlock.series[0]?.key;
  const comboBar = chartBlock.series[0]?.key;
  const comboLine = chartBlock.series[1]?.key;
  const pieMetric = chartBlock.series[0]?.key;
  const isDonut = chartBlock.chartType === "donut";

  const hasRows = Array.isArray(chartBlock.data) && chartBlock.data.length > 0;
  if (!hasRows) {
    return (
      <div className="flex h-full min-h-[160px] items-center justify-center px-2 py-4">
        <UiStateSurface
          variant="empty"
          title="Нет данных для графика"
          description="Результат запроса пустой или ещё не пришёл. Проверьте таблицу выше, фильтры и формулировку промпта."
          dense
          className="max-w-md border-0 bg-transparent p-0 shadow-none"
        />
      </div>
    );
  }

  if (chartBlock.chartType === "table") {
    return <TableFallback block={chartBlock} />;
  }
  if (chartBlock.chartType === "heatmap") {
    return <HeatmapFallback block={chartBlock} />;
  }
  if (chartBlock.chartType === "map") {
    return <MapPlaceholder block={chartBlock} />;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chartBlock.chartType === "horizontal_bar" ? (
        <BarChart data={chartBlock.data} layout="vertical" margin={{ ...chartMargins, left: 4 }}>
          <CartesianGrid {...grid} horizontal={false} />
          <XAxis
            type="number"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatYAxisTick(Number(v))}
          />
          <YAxis
            dataKey={chartBlock.xKey}
            type="category"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={100}
            tickFormatter={(v) => formatXAxisTick(v, chartBlock.xKey)}
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}
            formatter={(value: unknown, name: unknown) => [formatTooltipValue(value), displayColumnName(String(name))]}
          />
          {chartBlock.series.map((s, index) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={palette[index % palette.length]} radius={[0, 6, 6, 0]} />
          ))}
        </BarChart>
      ) : chartBlock.chartType === "stacked_bar" ? (
        <BarChart data={chartBlock.data} margin={chartMargins}>
          <CartesianGrid {...grid} strokeOpacity={0.65} />
          <XAxis
            type={isCityLikeXKey(chartBlock.xKey) ? "category" : undefined}
            dataKey={chartBlock.xKey}
            tick={axisTick}
            axisLine={{ stroke: "#cbd5e1" }}
            tickLine={false}
            interval={chartBlock.data.length <= 16 ? 0 : "preserveStartEnd"}
            tickFormatter={(v) => formatXAxisTick(v, chartBlock.xKey)}
            angle={chartBlock.data.length > 14 ? -32 : 0}
            textAnchor={chartBlock.data.length > 14 ? "end" : "middle"}
            height={chartBlock.data.length > 14 ? 52 : 32}
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            tickFormatter={(v) => formatYAxisTick(Number(v))}
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}
            formatter={(value: unknown, name: unknown) => [formatTooltipValue(value), displayColumnName(String(name))]}
            labelFormatter={(label) => formatXAxisTick(label, chartBlock.xKey)}
          />
          {chartBlock.series.map((s, index) => (
            <Bar key={s.key} stackId="stack-1" dataKey={s.key} name={s.name} fill={palette[index % palette.length]} />
          ))}
        </BarChart>
      ) : chartBlock.chartType === "bar" || chartBlock.chartType === "histogram" || chartBlock.chartType === "geo_bubble" ? (
        <BarChart data={chartBlock.data} margin={chartMargins}>
          <CartesianGrid {...grid} vertical={false} strokeOpacity={0.65} />
          <XAxis
            type={isCityLikeXKey(chartBlock.xKey) ? "category" : undefined}
            dataKey={chartBlock.xKey}
            tick={axisTick}
            axisLine={{ stroke: "#cbd5e1" }}
            tickLine={false}
            interval={chartBlock.data.length <= 16 ? 0 : "preserveStartEnd"}
            tickFormatter={(v) => formatXAxisTick(v, chartBlock.xKey)}
            angle={chartBlock.data.length > 14 ? -32 : 0}
            textAnchor={chartBlock.data.length > 14 ? "end" : "middle"}
            height={chartBlock.data.length > 14 ? 52 : 32}
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            tickFormatter={(v) => formatYAxisTick(Number(v))}
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}
            formatter={(value: unknown, name: unknown) => [formatTooltipValue(value), displayColumnName(String(name))]}
            labelFormatter={(label) => formatXAxisTick(label, chartBlock.xKey)}
          />
          {chartBlock.series.map((s, index) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={palette[index % palette.length]} radius={[6, 6, 0, 0]} />
          ))}
        </BarChart>
      ) : chartBlock.chartType === "area" ? (
        <AreaChart data={chartBlock.data} margin={chartMargins}>
          <CartesianGrid {...grid} strokeOpacity={0.65} />
          <XAxis
            type={isCityLikeXKey(chartBlock.xKey) ? "category" : undefined}
            dataKey={chartBlock.xKey}
            tick={axisTick}
            axisLine={{ stroke: "#cbd5e1" }}
            tickLine={false}
            interval={chartBlock.data.length <= 16 ? 0 : "preserveStartEnd"}
            tickFormatter={(v) => formatXAxisTick(v, chartBlock.xKey)}
            angle={chartBlock.data.length > 14 ? -32 : 0}
            textAnchor={chartBlock.data.length > 14 ? "end" : "middle"}
            height={chartBlock.data.length > 14 ? 52 : 32}
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            tickFormatter={(v) => formatYAxisTick(Number(v))}
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}
            formatter={(value: unknown, name: unknown) => [formatTooltipValue(value), displayColumnName(String(name))]}
            labelFormatter={(label) => formatXAxisTick(label, chartBlock.xKey)}
          />
          {chartBlock.series.map((s, index) => (
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
      ) : chartBlock.chartType === "combo" ? (
        <ComposedChart data={chartBlock.data} margin={chartMargins}>
          <CartesianGrid {...grid} />
          <XAxis
            dataKey={chartBlock.xKey}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            tickFormatter={(v) => formatXAxisTick(v, chartBlock.xKey)}
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            tickFormatter={(v) => formatYAxisTick(Number(v))}
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}
            formatter={(value: unknown, name: unknown) => [formatTooltipValue(value), displayColumnName(String(name))]}
            labelFormatter={(label) => formatXAxisTick(label, chartBlock.xKey)}
          />
          {comboBar ? <Bar dataKey={comboBar} name={comboBar} fill={palette[0]} radius={[4, 4, 0, 0]} /> : null}
          {comboLine ? <Line type="monotone" dataKey={comboLine} name={comboLine} stroke={palette[1]} strokeWidth={2} dot={false} /> : null}
        </ComposedChart>
      ) : chartBlock.chartType === "pie" || chartBlock.chartType === "donut" ? (
        <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}
            formatter={(value: unknown) => [formatTooltipValue(value), displayColumnName(String(pieMetric))]}
            labelFormatter={(label) => formatXAxisTick(label, chartBlock.xKey)}
          />
          <Pie data={chartBlock.data} dataKey={pieMetric} nameKey={chartBlock.xKey} cx="50%" cy="50%" outerRadius={78} innerRadius={isDonut ? 44 : 0}>
            {chartBlock.data.map((_, idx) => (
              <Cell key={`pie-${idx}`} fill={palette[idx % palette.length]} />
            ))}
          </Pie>
        </PieChart>
      ) : chartBlock.chartType === "scatter" ? (
        <ScatterChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey={block.xKey} type="number" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis dataKey={scatterY} type="number" tick={axisTick} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {scatterY ? <Scatter data={chartBlock.data} fill={palette[0]} /> : null}
        </ScatterChart>
      ) : chartBlock.chartType === "radar" ? (
        <RadarChart data={chartBlock.data} outerRadius="70%">
          <PolarGrid />
          <PolarAngleAxis dataKey={chartBlock.xKey} tick={{ fill: "#64748b", fontSize: 11 }} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          {chartBlock.series.map((s, index) => (
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
        <LineChart data={chartBlock.data} margin={chartMargins}>
          <CartesianGrid {...grid} strokeOpacity={0.65} />
          <XAxis
            type={isCityLikeXKey(chartBlock.xKey) ? "category" : undefined}
            dataKey={chartBlock.xKey}
            tick={axisTick}
            axisLine={{ stroke: "#cbd5e1" }}
            tickLine={false}
            interval={chartBlock.data.length <= 16 ? 0 : "preserveStartEnd"}
            minTickGap={chartBlock.data.length > 24 ? 8 : 4}
            tickFormatter={(v) => formatXAxisTick(v, chartBlock.xKey)}
            angle={chartBlock.data.length > 14 ? -32 : 0}
            textAnchor={chartBlock.data.length > 14 ? "end" : "middle"}
            height={chartBlock.data.length > 14 ? 52 : 32}
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={yAxisWidth}
            tickFormatter={(v) => formatYAxisTick(Number(v))}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 8px 24px rgba(15,23,42,0.08)" }}
            formatter={(value: unknown, name: unknown) => [formatTooltipValue(value), displayColumnName(String(name))]}
            labelFormatter={(label) => formatXAxisTick(label, chartBlock.xKey)}
          />
          {chartBlock.series.map((s, index) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={palette[index % palette.length]}
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 1.5, stroke: palette[index % palette.length], fill: "#fff" }}
              activeDot={{ r: 6, strokeWidth: 0, fill: palette[index % palette.length] }}
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}
