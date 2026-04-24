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

const EXEC_PROMPTS = [
  { id: "1", label: "Факторы перевыполнения / недовыполнения квартала", href: "/notebooks/strategy-board" as Route },
  { id: "2", label: "Риск географической концентрации", href: "/notebooks/strategy-board" as Route },
  { id: "3", label: "Ключевой KPI narrative для совета", href: "/notebooks/strategy-board" as Route }
];

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

export default function ExecutiveDashboardPage() {
  const workspaceQuery = useWorkspaceId();
  const notebooksQuery = useNotebooks();
  const reportsQuery = useSavedReports(workspaceQuery.data);
  const historyQuery = useQueryHistory(workspaceQuery.data, { scope: "workspace" });

  const kpis = useMemo<KpiMetric[]>(() => {
    const history = historyQuery.data ?? [];
    const total = history.length;
    const success = history.filter((h) => h.validation_ok).length;
    const avgMs = total ? Math.round(history.reduce((a, h) => a + (h.duration_ms || 0), 0) / total) : 0;
    return [
      { id: "reports", label: "Сохраненные отчеты", value: fmtNumber((reportsQuery.data ?? []).length), sub: "в workspace" },
      { id: "notebooks", label: "Стратегические сценарии", value: fmtNumber((notebooksQuery.data ?? []).length), sub: "доступные пользователю" },
      {
        id: "quality",
        label: "Качество SQL",
        value: `${total ? ((success / total) * 100).toFixed(0) : "0"}%`,
        sub: `${success}/${total || 0} валидных`,
        deltaPositive: total ? success / total >= 0.8 : true
      },
      { id: "time", label: "Скорость ответа", value: `${fmtNumber(avgMs)} ms`, sub: "среднее по истории" }
    ];
  }, [historyQuery.data, notebooksQuery.data, reportsQuery.data]);

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
        eyebrow="Руководство"
        title="Обзор для руководителя"
        description="Целостная картина по результатам, траектории и рискам - со стратегическими сценариями и готовыми отчетами."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((m) => (
          <KpiStatCard key={m.id} metric={m} />
        ))}
      </section>

      <TrainDatasetSummarySection workspaceId={workspaceQuery.data} />

      <SectionCard title="Быстрые запросы" description="Вопросы для стратегии и подготовки совета на естественном языке.">
        <QuickPrompts items={EXEC_PROMPTS} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Недавние сценарии">
          <RecentLinksList items={recentNotebooks} />
        </SectionCard>
        <SectionCard title="Сохраненные отчеты для руководства">
          <RecentLinksList items={recentReports} />
        </SectionCard>
      </div>
    </div>
  );
}
