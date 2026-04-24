"use client";

import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { KpiStatCard, type KpiMetric } from "@/components/dashboard/kpi-stat-card";
import { QuickPrompts } from "@/components/dashboard/quick-prompts";
import { RecentLinksList, type RecentListItem } from "@/components/dashboard/recent-links-list";
import { SectionCard } from "@/components/dashboard/section-card";
import { TrainDatasetSummarySection } from "@/components/dashboard/train-dataset-summary-section";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useNotebooks } from "@/hooks/api/use-notebooks";
import { useSavedReports } from "@/hooks/api/use-reports";
import { useQueryHistory } from "@/hooks/api/use-history";
import type { Route } from "next";
import { useMemo } from "react";

const MARKETER_PROMPTS = [
  { id: "1", label: "Отмены по city_id за прошлую неделю", href: "/notebooks/campaign-q1" as Route },
  { id: "2", label: "Сравни завершенные поездки по дням", href: "/notebooks/campaign-q1" as Route },
  { id: "3", label: "Средняя стоимость заказа по city_id", href: "/notebooks/campaign-q1" as Route }
];

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

export default function MarketerDashboardPage() {
  const workspaceQuery = useWorkspaceId();
  const notebooksQuery = useNotebooks();
  const reportsQuery = useSavedReports(workspaceQuery.data);
  const historyQuery = useQueryHistory(workspaceQuery.data, { scope: "mine" });

  const kpis = useMemo<KpiMetric[]>(() => {
    const history = historyQuery.data ?? [];
    const total = history.length;
    const done = history.filter((h) => h.validation_ok).length;
    const avgMs = total ? Math.round(history.reduce((a, h) => a + (h.duration_ms || 0), 0) / total) : 0;
    const charted = history.filter((h) => (h.chart_type ?? "").trim().length > 0).length;
    return [
      { id: "h", label: "Запросы маркетинга", value: fmtNumber(total), sub: "за выбранный период" },
      {
        id: "ok",
        label: "Успешная валидация",
        value: `${total ? ((done / total) * 100).toFixed(0) : "0"}%`,
        sub: `${done}/${total || 0} запросов`,
        deltaPositive: total ? done / total >= 0.8 : true
      },
      { id: "viz", label: "С графиком", value: fmtNumber(charted), sub: "запросы с chart_type" },
      { id: "lat", label: "Среднее время", value: `${fmtNumber(avgMs)} ms`, sub: "по истории запусков" }
    ];
  }, [historyQuery.data]);

  const recentNotebooks = useMemo<RecentListItem[]>(
    () =>
      (notebooksQuery.data ?? [])
        .slice(0, 5)
        .map((n) => ({
          id: n.id,
          title: n.title,
          meta: `Обновлено ${new Date(n.updated_at ?? n.created_at).toLocaleString("ru-RU")}`,
          href: (`/notebooks/${n.id}` as Route)
        })),
    [notebooksQuery.data]
  );

  const recentReports = useMemo<RecentListItem[]>(
    () =>
      (reportsQuery.data ?? [])
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          title: r.title,
          meta: `${(r as { report_format?: string }).report_format?.toUpperCase() ?? "PDF"} · ${new Date(r.updated_at).toLocaleString("ru-RU")}`,
          href: "/reports" as Route
        })),
    [reportsQuery.data]
  );

  return (
    <div className="layout-page-stack">
      <DashboardHero
        eyebrow="In-city аналитика"
        title="Аналитика заказов и завершения поездок"
        description="Отмены, завершенные поездки и качество ценообразования на подтвержденной анонимизированной схеме."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((m) => (
          <KpiStatCard key={m.id} metric={m} />
        ))}
      </section>

      <TrainDatasetSummarySection workspaceId={workspaceQuery.data} />

      <SectionCard title="Быстрые запросы" description="Готовые высоко-сигнальные запросы по подтвержденной схеме.">
        <QuickPrompts items={MARKETER_PROMPTS} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Недавние сценарии">
          <RecentLinksList items={recentNotebooks} />
        </SectionCard>
        <SectionCard title="Недавние отчеты">
          <RecentLinksList items={recentReports} />
        </SectionCard>
      </div>
    </div>
  );
}
