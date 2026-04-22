import { CtaNotebookBanner } from "@/components/dashboard/cta-notebook-banner";
import { AutoMLBulkApplyCard } from "@/components/dashboard/automl-bulk-apply-card";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { GeoOrdersPreview, HeatmapGridPreview } from "@/components/dashboard/dashboard-mini-charts";
import { KpiStatCard } from "@/components/dashboard/kpi-stat-card";
import { QuickPrompts } from "@/components/dashboard/quick-prompts";
import { RecentLinksList } from "@/components/dashboard/recent-links-list";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import type { Route } from "next";
import {
  GEO_REGION_DATA,
  GEO_HEATMAP_GRID,
  MANAGER_KPIS,
  MANAGER_PROMPTS,
  RECENT_NOTEBOOKS,
  RECENT_REPORTS
} from "@/lib/dashboard/mock-data";

export default function ManagerDashboardPage() {
  return (
    <div className="layout-page-stack">
      <DashboardHero
        eyebrow="Операции"
        title="Центр управления менеджера"
        description="Поток заказов, отмены и здоровье исполнения - с быстрым переходом в сценарии и отчеты."
      />
      <DemoQuickActions
        items={[
          { label: "Операционный сценарий", href: "/notebooks/ops-health", hint: "Clarification + follow-up сценарий" },
          { label: "История запусков", href: "/history", hint: "Проверить последние ошибки и предупреждения" },
          { label: "Отчеты", href: "/reports", hint: "Поделиться еженедельным KPI-паком" }
        ]}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MANAGER_KPIS.map((m) => (
          <KpiStatCard key={m.id} metric={m} />
        ))}
      </section>

      <SectionCard title="Быстрые запросы" description="Переход в операционный сценарий с готовыми вопросами.">
        <QuickPrompts items={MANAGER_PROMPTS} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Недавние сценарии">
          <RecentLinksList items={RECENT_NOTEBOOKS} />
        </SectionCard>
        <SectionCard title="Недавние отчеты">
          <RecentLinksList items={RECENT_REPORTS} />
        </SectionCard>
      </div>

      <CtaNotebookBanner
        title="Операционный сценарий"
        description="Исключения в реальном времени, детализация SLA и региональные срезы для ежедневных стендапов."
        href={"/notebooks/ops-health" as Route}
        label="Открыть операционный сценарий"
      />

      <SectionCard
        title="Предпросмотр гео-визуализации"
        description="Заказы по макрорегионам (mock). Полноценная карта подключается через GIS-коннектор."
      >
        <GeoOrdersPreview data={GEO_REGION_DATA} />
      </SectionCard>

      <SectionCard
        title="Heatmap fallback"
        description="Плотность заказов по ключевым городам, когда картографический слой недоступен."
      >
        <HeatmapGridPreview data={GEO_HEATMAP_GRID} />
      </SectionCard>

      <AutoMLBulkApplyCard compact />
    </div>
  );
}
