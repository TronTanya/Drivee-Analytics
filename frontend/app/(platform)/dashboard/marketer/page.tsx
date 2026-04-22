import { CtaNotebookBanner } from "@/components/dashboard/cta-notebook-banner";
import { AutoMLBulkApplyCard } from "@/components/dashboard/automl-bulk-apply-card";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import {
  MarketerRoiByChannelPreview,
  MarketerSpendRevenuePreview
} from "@/components/dashboard/dashboard-mini-charts";
import { KpiStatCard } from "@/components/dashboard/kpi-stat-card";
import { QuickPrompts } from "@/components/dashboard/quick-prompts";
import { RecentLinksList } from "@/components/dashboard/recent-links-list";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import type { Route } from "next";
import {
  MARKETER_CHART_A,
  MARKETER_CHART_B,
  MARKETER_KPIS,
  MARKETER_PROMPTS,
  RECENT_NOTEBOOKS,
  RECENT_REPORTS
} from "@/lib/dashboard/mock-data";

export default function MarketerDashboardPage() {
  return (
    <div className="layout-page-stack">
      <DashboardHero
        eyebrow="In-city аналитика"
        title="Аналитика заказов и завершения поездок"
        description="Отмены, завершенные поездки и качество ценообразования на подтвержденной анонимизированной схеме."
      />
      <DemoQuickActions
        items={[
          { label: "In-city сценарий", href: "/notebooks/campaign-q1", hint: "Поток заказов и отмен" },
          { label: "Шаблоны", href: "/templates", hint: "Быстрый запуск шаблонов city/status" },
          { label: "Загрузка данных", href: "/data-upload", hint: "Добавить справочник городов" }
        ]}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MARKETER_KPIS.map((m) => (
          <KpiStatCard key={m.id} metric={m} />
        ))}
      </section>

      <SectionCard title="Быстрые запросы" description="Готовые высоко-сигнальные запросы по подтвержденной схеме.">
        <QuickPrompts items={MARKETER_PROMPTS} />
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
        title="In-city сценарий заказов"
        description="Диагностика отмен, завершения и цены в одном AI-сценарии."
        href={"/notebooks/campaign-q1" as Route}
        label="Открыть in-city сценарий"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Заказы vs завершенные поездки" description="Последние 5 дней · mock-серия">
          <MarketerSpendRevenuePreview data={MARKETER_CHART_A} />
        </SectionCard>
        <SectionCard title="Отмены по city_id" description="Топ city_id · mock">
          <MarketerRoiByChannelPreview data={MARKETER_CHART_B} />
        </SectionCard>
      </div>

      <AutoMLBulkApplyCard compact />
    </div>
  );
}
