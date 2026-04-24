"use client";

import { AdminDemoFlows } from "@/components/dashboard/admin-demo-flows";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { KpiStatCard, type KpiMetric } from "@/components/dashboard/kpi-stat-card";
import { RecentLinksList, type RecentListItem } from "@/components/dashboard/recent-links-list";
import { SectionCard } from "@/components/dashboard/section-card";
import { TrainDatasetSummarySection } from "@/components/dashboard/train-dataset-summary-section";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useNotebooks } from "@/hooks/api/use-notebooks";
import { useSavedReports } from "@/hooks/api/use-reports";
import { useQueryHistory } from "@/hooks/api/use-history";
import type { Route } from "next";
import Link from "next/link";
import { useMemo } from "react";

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

export default function AdminDashboardPage() {
  const workspaceQuery = useWorkspaceId();
  const notebooksQuery = useNotebooks();
  const reportsQuery = useSavedReports(workspaceQuery.data);
  const historyQuery = useQueryHistory(workspaceQuery.data, { scope: "workspace" });

  const kpis = useMemo<KpiMetric[]>(() => {
    const history = historyQuery.data ?? [];
    const totalQueries = history.length;
    const failed = history.filter((x) => !x.validation_ok).length;
    const failedPct = totalQueries > 0 ? (failed / totalQueries) * 100 : 0;
    return [
      { id: "nb", label: "Сценарии в системе", value: fmtNumber((notebooksQuery.data ?? []).length) },
      { id: "rep", label: "Отчеты в системе", value: fmtNumber((reportsQuery.data ?? []).length) },
      {
        id: "failed",
        label: "SQL warnings",
        value: `${failedPct.toFixed(0)}%`,
        sub: `${failed}/${totalQueries || 0} запросов`,
        deltaPositive: failedPct < 20
      },
      { id: "q", label: "Запросов за период", value: fmtNumber(totalQueries) }
    ];
  }, [historyQuery.data, notebooksQuery.data, reportsQuery.data]);

  const recentActivity = useMemo<RecentListItem[]>(
    () =>
      (historyQuery.data ?? []).slice(0, 6).map((h) => ({
        id: h.id,
        title: h.label || "Запрос",
        meta: `${h.validation_ok ? "ok" : "warning"} · ${new Date(h.ran_at).toLocaleString("ru-RU")}`,
        href: h.notebook_id ? (`/notebooks/${h.notebook_id}` as Route) : ("/history" as Route)
      })),
    [historyQuery.data]
  );

  const adminLinks: RecentListItem[] = [
    { id: "c", title: "Коррекции SQL", meta: "Очередь learned-исправлений", href: "/corrections" as Route },
    { id: "d", title: "Словарь", meta: "Управление семантическими терминами", href: "/dictionary" as Route },
    { id: "t", title: "Шаблоны", meta: "Ролевые шаблоны и пресеты", href: "/templates" as Route },
    { id: "u", title: "Загрузка данных", meta: "Импорт и проверка качества", href: "/data-upload" as Route },
    { id: "h", title: "История", meta: "Журнал запусков и SQL", href: "/history" as Route }
  ];

  return (
    <div className="layout-page-stack">
      <DashboardHero
        eyebrow="Администрирование"
        title="Панель управления платформой"
        description="Настройка источников, семантики, доступа и аудита без выхода из аналитической платформы."
        trailing={
          <Link
            href={"/settings" as Route}
            className="rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800"
          >
            Глобальные настройки
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((m) => (
          <KpiStatCard key={m.id} metric={m} />
        ))}
      </section>

      <TrainDatasetSummarySection workspaceId={workspaceQuery.data} />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Разделы администрирования">
          <RecentLinksList items={adminLinks} />
        </SectionCard>
        <SectionCard title="Последняя активность">
          <RecentLinksList items={recentActivity} />
        </SectionCard>
      </div>

      <AdminDemoFlows />

      <div className="rounded-card border border-border-subtle bg-surface-muted/50 px-4 py-3 text-xs text-foreground-secondary">
        <span className="font-semibold text-foreground">Платформа</span> · Виджеты дашборда построены на реальных
        списках сценариев, отчетов и истории SQL-запросов.
      </div>
    </div>
  );
}
