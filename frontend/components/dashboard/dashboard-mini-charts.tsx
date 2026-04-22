"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const tick = { fill: "#64748b", fontSize: 10 };
const grid = { stroke: "#e2e8f0", strokeDasharray: "3 3" as const };

export function GeoOrdersPreview({ data }: { data: { region: string; orders: number }[] }) {
  return (
    <div className="rounded-control border border-border-subtle bg-gradient-to-b from-surface-card to-surface-muted/35 p-2">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
          <CartesianGrid {...grid} horizontal={false} />
          <XAxis type="number" tick={tick} axisLine={false} tickLine={false} />
          <YAxis dataKey="region" type="category" width={52} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(24,161,95,0.06)" }}
            contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
          />
          <Bar dataKey="orders" name="Заказы" fill="#18a15f" radius={[0, 6, 6, 0]} barSize={14} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ExecTrendPreview({ data }: { data: { m: string; v: number }[] }) {
  return (
    <div className="rounded-control border border-border-subtle bg-gradient-to-b from-surface-card to-surface-muted/35 p-2">
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="m" tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={28} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Area type="monotone" dataKey="v" stroke="#12814c" fill="#18a15f" fillOpacity={0.12} strokeWidth={2} name="Индекс" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ForecastBandPreview({
  data
}: {
  data: { w: string; low: number; mid: number; high: number }[];
}) {
  return (
    <div className="rounded-control border border-border-subtle bg-gradient-to-b from-surface-card to-surface-muted/35 p-2">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="w" tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={32} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Line type="monotone" dataKey="high" stroke="#94a3b8" strokeDasharray="4 4" dot={false} name="Верхняя граница" />
          <Line type="monotone" dataKey="mid" stroke="#18a15f" strokeWidth={2} dot name="Базовый сценарий" />
          <Line type="monotone" dataKey="low" stroke="#94a3b8" strokeDasharray="4 4" dot={false} name="Нижняя граница" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarketerSpendRevenuePreview({ data }: { data: { day: string; orders: number; done: number }[] }) {
  return (
    <div className="rounded-control border border-border-subtle bg-gradient-to-b from-surface-card to-surface-muted/35 p-2">
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="day" tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={28} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Line type="monotone" dataKey="orders" stroke="#6366f1" strokeWidth={2} dot={false} name="Заказы" />
          <Line type="monotone" dataKey="done" stroke="#18a15f" strokeWidth={2} dot={false} name="Завершенные поездки" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarketerRoiByChannelPreview({ data }: { data: { city: string; cancellations: number }[] }) {
  return (
    <div className="rounded-control border border-border-subtle bg-gradient-to-b from-surface-card to-surface-muted/35 p-2">
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="city" tick={tick} axisLine={false} tickLine={false} />
          <YAxis tick={tick} axisLine={false} tickLine={false} width={28} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Bar dataKey="cancellations" name="Отмены" fill="#18a15f" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RadarProfilePreview({
  data
}: {
  data: { segment: string; volume: number; quality: number; speed: number }[];
}) {
  return (
    <div className="rounded-control border border-border-subtle bg-gradient-to-b from-surface-card to-surface-muted/35 p-2">
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid />
          <PolarAngleAxis dataKey="segment" tick={{ fill: "#64748b", fontSize: 11 }} />
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
          <Radar dataKey="volume" stroke="#18a15f" fill="#18a15f" fillOpacity={0.15} />
          <Radar dataKey="quality" stroke="#6366f1" fill="#6366f1" fillOpacity={0.12} />
          <Radar dataKey="speed" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HeatmapGridPreview({
  data
}: {
  data: { label: string; value: number }[];
}) {
  const vals = data.map((d) => d.value);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const span = max - min || 1;
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      {data.map((row) => {
        const ratio = (row.value - min) / span;
        const alpha = 0.14 + ratio * 0.7;
        return (
          <div key={row.label} className="rounded-control border border-border-subtle px-2 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{row.label}</span>
              <span className="tabular-nums text-foreground-secondary">{row.value}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-surface-muted">
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
