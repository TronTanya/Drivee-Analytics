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
import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { fetchQualityCenterSummary } from "@/lib/api/evaluation";
import type { QualityCenterOverview } from "@/types/api/evaluation";

const MANAGER_PROMPTS = [
  { id: "1", label: "Где растут отмены по складам?", href: "/notebooks/ops-health" as Route },
  { id: "2", label: "Нарушения SLA за последние 7 дней", href: "/notebooks/ops-health" as Route },
  { id: "3", label: "Бэклог vs capacity на завтра", href: "/notebooks/ops-health" as Route }
];

function fmtNumber(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(n);
}

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export default function ManagerDashboardPage() {
  const [qc, setQc] = useState<QualityCenterOverview | null>(null);
  useEffect(() => {
    void fetchQualityCenterSummary("deterministic")
      .then(setQc)
      .catch(() => setQc(null));
  }, []);

  const workspaceQuery = useWorkspaceId();
  const notebooksQuery = useNotebooks();
  const reportsQuery = useSavedReports(workspaceQuery.data);
  const historyQuery = useQueryHistory(workspaceQuery.data, { scope: "mine" });

  const kpis = useMemo<KpiMetric[]>(() => {
    const history = historyQuery.data ?? [];
    const notebooks = notebooksQuery.data ?? [];
    const reports = reportsQuery.data ?? [];
    const totalQueries = history.length;
    const passed = history.filter((h) => h.validation_ok).length;
    const successPct = totalQueries > 0 ? (passed / totalQueries) * 100 : 0;
    const avgMs = totalQueries > 0 ? Math.round(history.reduce((a, h) => a + (h.duration_ms || 0), 0) / totalQueries) : 0;
    const avgPriceSamples = history
      .map((h) => {
        const m = h.sql_preview.match(/avg\([^)]+\)\s+as\s+avg_(?:check|order_price|price)/i);
        return m ? 1 : 0;
      })
      .reduce<number>((a, b) => a + b, 0);

    return [
      {
        id: "nb",
        label: "Сценарии",
        value: fmtNumber(notebooks.length),
        sub: "в системе"
      },
      {
        id: "reports",
        label: "Отчёты",
        value: fmtNumber(reports.length),
        sub: "сохраненные"
      },
      {
        id: "validation",
        label: "SQL passed",
        value: `${successPct.toFixed(0)}%`,
        sub: `${passed}/${totalQueries || 0} запросов`,
        deltaPositive: successPct >= 80
      },
      {
        id: "latency",
        label: "Среднее время",
        value: `${fmtNumber(avgMs)} ms`,
        sub: avgPriceSamples ? `avg-чек встречался в ${avgPriceSamples} запросах` : "по истории запросов"
      }
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
        eyebrow="Операции"
        title="Центр управления менеджера"
        description="Поток заказов, отмены и здоровье исполнения - с быстрым переходом в сценарии и отчеты."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((m) => (
          <KpiStatCard key={m.id} metric={m} />
        ))}
      </section>

      <TrainDatasetSummarySection workspaceId={workspaceQuery.data} />

      <SectionCard
        title="Качество AI-аналитики под контролем"
        description="Golden tests проверяют understanding, SQL correctness, visual match и guardrails."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-control border border-border-subtle bg-surface-muted/40 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Overall Quality Score</div>
            <div className="mt-1 text-xl font-semibold text-brand-800">{qc ? pct(qc.overall_quality_score) : "—"}</div>
          </div>
          <div className="rounded-control border border-border-subtle bg-surface-muted/40 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">SQL Correctness</div>
            <div className="mt-1 text-xl font-semibold text-foreground">{qc ? pct(qc.sql_correctness.overall_accuracy) : "—"}</div>
          </div>
          <div className="rounded-control border border-border-subtle bg-surface-muted/40 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Guardrail Accuracy</div>
            <div className="mt-1 text-xl font-semibold text-foreground">{qc ? pct(qc.guardrails_safety.overall_accuracy) : "—"}</div>
          </div>
        </div>
        <Link
          href={"/quality" as Route}
          className="inline-flex items-center rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700"
        >
          Открыть Quality Center
        </Link>
      </SectionCard>

      <SectionCard title="Быстрые запросы" description="Переход в операционный сценарий с готовыми вопросами.">
        <QuickPrompts items={MANAGER_PROMPTS} />
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
