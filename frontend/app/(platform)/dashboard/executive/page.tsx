import { CtaNotebookBanner } from "@/components/dashboard/cta-notebook-banner";
import { AutoMLBulkApplyCard } from "@/components/dashboard/automl-bulk-apply-card";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { ExecTrendPreview, ForecastBandPreview, RadarProfilePreview } from "@/components/dashboard/dashboard-mini-charts";
import { KpiStatCard } from "@/components/dashboard/kpi-stat-card";
import { QuickPrompts } from "@/components/dashboard/quick-prompts";
import { RecentLinksList } from "@/components/dashboard/recent-links-list";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import type { Route } from "next";
import {
  EXEC_KPIS,
  EXEC_PROMPTS,
  EXEC_RADAR_PROFILE,
  EXEC_SAVED_REPORTS,
  FORECAST_BANDS,
  RECENT_NOTEBOOKS,
  TREND_SERIES
} from "@/lib/dashboard/mock-data";

export default function ExecutiveDashboardPage() {
  return (
    <div className="layout-page-stack">
      <DashboardHero
        eyebrow="Руководство"
        title="Обзор для руководителя"
        description="Целостная картина по результатам, траектории и рискам - со стратегическими сценариями и готовыми отчетами."
      />
      <DemoQuickActions
        items={[
          { label: "Стратегический сценарий", href: "/notebooks/strategy-board", hint: "Режим прогноза в trace" },
          { label: "Отчеты", href: "/reports", hint: "Экспорт для совета" },
          { label: "История", href: "/history", hint: "Проверка уверенности и предупреждений" }
        ]}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {EXEC_KPIS.map((m) => (
          <KpiStatCard key={m.id} metric={m} />
        ))}
      </section>

      <SectionCard title="Быстрые запросы" description="Вопросы для стратегии и подготовки совета на естественном языке.">
        <QuickPrompts items={EXEC_PROMPTS} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Недавние сценарии">
          <RecentLinksList items={RECENT_NOTEBOOKS} />
        </SectionCard>
        <SectionCard title="Сохраненные отчеты для руководства">
          <RecentLinksList items={EXEC_SAVED_REPORTS} />
        </SectionCard>
      </div>

      <SectionCard title="Предпросмотр тренда" description="Сводный стратегический индекс (mock) - замените на ваш KPI-набор.">
        <ExecTrendPreview data={TREND_SERIES} />
      </SectionCard>

      <SectionCard title="Радар-профиль регионов" description="Volume/Quality/Speed по ключевым регионам.">
        <RadarProfilePreview data={EXEC_RADAR_PROFILE} />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <CtaNotebookBanner
          title="Стратегический сценарий"
          description="Сценарии, чувствительность и narrative-блоки для стратегических сессий."
          href={"/notebooks/strategy-board" as Route}
          label="Открыть стратегический сценарий"
        />
        <SectionCard title="Предпросмотр прогноза" description="Базовый сценарий с верхней и нижней границей (mock-единицы).">
          <ForecastBandPreview data={FORECAST_BANDS} />
        </SectionCard>
      </div>

      <AutoMLBulkApplyCard compact />
    </div>
  );
}
