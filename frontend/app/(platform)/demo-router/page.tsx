"use client";

import type { Route } from "next";
import Link from "next/link";
import { useSession } from "@/lib/auth/session-context";
import { getDemoApiMode, isDemoModeEnabled, shouldForceAnalyticsMock } from "@/lib/api";
import { DEFENSE_DEMO_SCENARIOS } from "@/lib/demo/defense-scenarios";

const ROLE_INFO: Record<
  "admin" | "manager" | "marketer" | "executive",
  { title: string; summary: string; dashboardHref: Route }
> = {
  admin: {
    title: "Администратор",
    summary: "Управляете пользователями, доступами, словарем и источниками данных.",
    dashboardHref: "/dashboard/admin"
  },
  manager: {
    title: "Менеджер",
    summary: "Следите за SLA, отменами, эффективностью и ежедневными операционными KPI.",
    dashboardHref: "/dashboard/manager"
  },
  marketer: {
    title: "Маркетолог",
    summary: "Анализируете кампании, воронку, атрибуцию и влияние креативов на метрики.",
    dashboardHref: "/dashboard/marketer"
  },
  executive: {
    title: "Руководитель",
    summary: "Смотрите ключевые показатели, прогнозные коридоры и board-ready сводки.",
    dashboardHref: "/dashboard/executive"
  }
};

const ROLE_CAPABILITIES: Record<"admin" | "manager" | "marketer" | "executive", { title: string; text: string }[]> = {
  admin: [
    {
      title: "Управление доступами",
      text: "Контроль ролей пользователей и доступа к системным разделам платформы."
    },
    {
      title: "Словарь и данные",
      text: "Настройка бизнес-словаря, проверка источников данных и качество метрик."
    },
    {
      title: "Системный мониторинг",
      text: "Просмотр истории запусков, инцидентов и корректировок в едином контуре."
    },
    {
      title: "Шаблоны и стандарты",
      text: "Поддержка единых шаблонов сценариев и аналитических стандартов команды."
    }
  ],
  manager: [
    {
      title: "Операционный дашборд",
      text: "Контроль SLA, отмен, нагрузки и ключевых KPI по командам и регионам."
    },
    {
      title: "Сценарии по отклонениям",
      text: "Быстрый разбор причин отклонений и принятие корректирующих действий."
    },
    {
      title: "Отчеты для управления",
      text: "Формирование регулярных управленческих отчетов по результатам периода."
    },
    {
      title: "История и повторные запуски",
      text: "Повтор аналитических запусков и сравнение результатов между периодами."
    }
  ],
  marketer: [
    {
      title: "Дашборд маркетолога",
      text: "Контроль динамики кампаний, ключевых KPI и эффективности каналов в одном экране."
    },
    {
      title: "Сценарный анализ",
      text: "Быстрые сценарии для проверки гипотез, сравнения периодов и анализа отклонений."
    },
    {
      title: "Отчеты и брифы",
      text: "Подготовка отчетов с визуализациями для команды и руководства."
    },
    {
      title: "Шаблоны и история",
      text: "Повторный запуск типовых запросов и контроль прошлых запусков без ручной настройки."
    }
  ],
  executive: [
    {
      title: "Executive-дашборд",
      text: "Просмотр ключевых бизнес-метрик и трендов в кратком стратегическом формате."
    },
    {
      title: "Прогнозные коридоры",
      text: "Оценка сценариев развития и рисков на основе прогнозных моделей."
    },
    {
      title: "Board-ready отчеты",
      text: "Подготовка материалов для совещаний и регулярных отчетов руководства."
    },
    {
      title: "Сводки по отклонениям",
      text: "Фокус на критичных изменениях показателей и их влиянии на цели компании."
    }
  ]
};

function SectionTitle({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{kicker}</p>
      <h2 className="text-heading-2 text-foreground">{title}</h2>
      <p className="max-w-2xl text-sm text-foreground-secondary">{description}</p>
    </div>
  );
}

export default function DemoRouterPage() {
  const { session } = useSession();
  const activeRole = ROLE_INFO[session.role];
  const activeCapabilities = ROLE_CAPABILITIES[session.role];
  const demoMode = isDemoModeEnabled();
  const apiMode = getDemoApiMode();
  const analyticsForcedMock = shouldForceAnalyticsMock();

  return (
    <div className="space-y-8">
      <section className="surface-section p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Текущая роль</p>
        <h2 className="mt-1 text-heading-2 text-foreground">{activeRole.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground-secondary">{activeRole.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="inline-flex rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-900">
            Demo mode: {demoMode ? "enabled" : "disabled"}
          </span>
          <span className="inline-flex rounded-full border border-border-subtle bg-surface-muted px-3 py-1 text-xs font-semibold text-foreground-secondary">
            API: {apiMode}
          </span>
          <span className="inline-flex rounded-full border border-border-subtle bg-surface-muted px-3 py-1 text-xs font-semibold text-foreground-secondary">
            Analytics: {analyticsForcedMock ? "client mock only" : "live + error fallback"}
          </span>
        </div>
        <Link
          href={activeRole.dashboardHref}
          className="interactive-focus mt-4 inline-flex items-center rounded-control bg-brand-500 px-4 py-2 text-sm font-semibold text-black hover:bg-brand-400"
        >
          Открыть дашборд роли
        </Link>
      </section>

      <section className="surface-section p-5 sm:p-6">
        <SectionTitle
          kicker="Defense scenarios"
          title="Четыре сценария защиты"
          description="Каждый сопровождается seed-данными, шаблоном/промптом, ожидаемым результатом и контролируемым fallback (см. docs/demo-defense.md)."
        />
        <div className="mt-4 space-y-4">
          {DEFENSE_DEMO_SCENARIOS.map((s) => (
            <article key={s.id} className="surface-content space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">{s.title}</h3>
                <Link
                  href={s.primaryHref}
                  className="shrink-0 rounded-control bg-brand-500 px-3 py-1 text-xs font-semibold text-black hover:bg-brand-400"
                >
                  Открыть
                </Link>
              </div>
              <p className="text-xs text-foreground-secondary">{s.pitch}</p>
              <div className="rounded-control border border-border-subtle bg-surface-muted p-2 font-mono text-[11px] text-foreground">
                {s.nlPrompt}
              </div>
              <p className="text-[11px] text-foreground-muted">
                <span className="font-semibold text-foreground-secondary">Seed / данные: </span>
                {s.seedDataRu}
              </p>
              <p className="text-[11px] text-foreground-muted">
                <span className="font-semibold text-foreground-secondary">Ожидаемый результат: </span>
                {s.expectedOutcomeRu}
              </p>
              <p className="text-[11px] text-foreground-muted">
                <span className="font-semibold text-foreground-secondary">Fallback: </span>
                {s.fallbackFlowRu}
              </p>
              {s.queryTemplateKey ? (
                <p className="text-[11px] font-mono text-foreground-muted">template_key: {s.queryTemplateKey}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {s.secondaryHrefs.map((x) => (
                  <Link
                    key={x.href}
                    href={x.href}
                    className="rounded-control border border-border-subtle px-2 py-1 text-[11px] font-semibold text-foreground-secondary hover:bg-surface-muted"
                  >
                    {x.label}
                  </Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-section p-5 sm:p-6">
        <SectionTitle
          kicker="Main demo path"
          title="Стабильные сценарии для защиты"
          description="Используйте эти маршруты в основном показе: они покрывают NL→SQL→result→report и работают с fallback."
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Link
            href={"/notebooks/ops-health" as Route}
            className="surface-content p-4 transition hover:border-brand-200 hover:bg-brand-50"
          >
            <p className="text-sm font-semibold text-foreground">Main notebook demo</p>
            <p className="mt-1 text-xs text-foreground-secondary">Топ-3 города по отменам → explainability → SQL → chart → save report</p>
          </Link>
          <Link
            href={"/notebooks/clarification-demo" as Route}
            className="surface-content p-4 transition hover:border-brand-200 hover:bg-brand-50"
          >
            <p className="text-sm font-semibold text-foreground">Clarification demo</p>
            <p className="mt-1 text-xs text-foreground-secondary">Двусмысленный запрос → уточнение → обновленный план и результат</p>
          </Link>
          <Link
            href={"/notebooks/follow-up-demo" as Route}
            className="surface-content p-4 transition hover:border-brand-200 hover:bg-brand-50"
          >
            <p className="text-sm font-semibold text-foreground">Follow-up demo</p>
            <p className="mt-1 text-xs text-foreground-secondary">Основной запрос → follow-up по городу/периоду</p>
          </Link>
          <Link
            href={"/reports" as Route}
            className="surface-content p-4 transition hover:border-brand-200 hover:bg-brand-50"
          >
            <p className="text-sm font-semibold text-foreground">Report reuse demo</p>
            <p className="mt-1 text-xs text-foreground-secondary">Сохранение отчета, повторный запуск и выгрузка PDF</p>
          </Link>
        </div>
      </section>

      <section className="surface-section p-5 sm:p-6">
        <SectionTitle
          kicker="Advanced"
          title="Дополнительные модули (не основной путь)"
          description="Показывайте только при наличии времени. В основной защите оставляйте фокус на стабильных сценариях."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { href: "/history", label: "История" },
            { href: "/forecast-lab", label: "Forecast Lab" },
            { href: "/data-upload", label: "Загрузка данных" },
            { href: "/dictionary", label: "Словарь" }
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href as Route}
              className="rounded-control border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <SectionTitle
          kicker={activeRole.title}
          title={`Краткая карта возможностей: ${activeRole.title}`}
          description={`Основные действия и точки входа для роли «${activeRole.title}» в этой платформе.`}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {activeCapabilities.map((item) => (
            <article key={item.title} className="surface-section p-5">
              <h3 className="text-heading-3 text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{item.text}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
