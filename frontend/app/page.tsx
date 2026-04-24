import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

type FlowZone = "input" | "reasoning" | "execution" | "outcomes";

const FLOW_STEPS: { title: string; zone: FlowZone; zoneLabel: string }[] = [
  { title: "Пользователь пишет вопрос", zone: "input", zoneLabel: "Input" },
  { title: "AI-интерпретация запроса", zone: "reasoning", zoneLabel: "Reasoning" },
  { title: "Semantic Layer", zone: "reasoning", zoneLabel: "Reasoning" },
  { title: "Генерация SQL", zone: "reasoning", zoneLabel: "Reasoning" },
  { title: "SQL Validation + Guardrails", zone: "execution", zoneLabel: "Execution" },
  { title: "Выполнение запроса к БД", zone: "execution", zoneLabel: "Execution" },
  { title: "Таблица результатов", zone: "outcomes", zoneLabel: "Outcomes" },
  { title: "Автовыбор графика", zone: "outcomes", zoneLabel: "Outcomes" },
  { title: "Insight", zone: "outcomes", zoneLabel: "Outcomes" },
  { title: "Baseline Forecast", zone: "outcomes", zoneLabel: "Outcomes" },
  { title: "Explainability Trace", zone: "outcomes", zoneLabel: "Outcomes" },
  { title: "Notebook / Report / History", zone: "outcomes", zoneLabel: "Outcomes" }
];

const FLOW_ZONE_STYLES: Record<FlowZone, string> = {
  input: "border-slate-200 bg-slate-50 text-slate-800",
  reasoning: "border-sky-200 bg-sky-50 text-sky-900",
  execution: "border-amber-200 bg-amber-50 text-amber-900",
  outcomes: "border-brand-200 bg-brand-50 text-brand-900"
};

const HOW_IT_WORKS = [
  {
    title: "1. Задайте вопрос",
    text: "Пользователь пишет запрос на естественном языке без SQL и сложных фильтров."
  },
  {
    title: "2. Система понимает бизнес-смысл",
    text: "AI определяет метрику, период, группировку, фильтры и возможную неоднозначность запроса."
  },
  {
    title: "3. Генерируется и проверяется SQL",
    text: "Запрос проходит через semantic layer, guardrails и validation before execution."
  },
  {
    title: "4. Получите результат",
    text: "Система показывает таблицу, подходящий график, краткий insight, explainability trace и базовый прогноз."
  }
];

const CAPABILITIES = [
  "Notebook-first UX",
  "NL → SQL",
  "Explainability by design",
  "Role-based analytics",
  "Reports, History, Templates",
  "Forecast inside workflow"
];

const ROLES = ["Manager", "Marketer", "Executive", "Admin"];

const VALUE_POINTS = [
  "Снижает зависимость от аналитиков и техспециалистов",
  "Ускоряет путь от вопроса до решения",
  "Делает AI-аналитику прозрачной",
  "Объединяет в одном продукте ad-hoc анализ, отчеты, шаблоны и историю",
  "Дает не только аналитику по прошлым данным, но и прогнозирование"
];

function SectionTitle({
  label,
  title,
  subtitle
}: {
  label: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-10 max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-muted">{label}</p>
      <h2 className="text-heading-1 mt-3 tracking-tight text-foreground sm:text-display sm:leading-tight">{title}</h2>
      <p className="mt-4 text-base leading-relaxed text-foreground-secondary">{subtitle}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-surface-canvas text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
        <header className="surface-hero px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Image
                src="/drivee-logo-v3.png"
                alt="Drive Analytics"
                width={220}
                height={110}
                className="h-10 w-auto rounded-xl sm:h-12"
                priority
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={"/register" as Route}
                className="interactive-focus rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-sm font-semibold text-foreground-secondary shadow-xs transition hover:bg-surface-muted hover:text-foreground"
              >
                Регистрация
              </Link>
              <Link
                href={"/login" as Route}
                className="interactive-focus rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-sm font-semibold text-foreground-secondary shadow-xs transition hover:bg-surface-muted hover:text-foreground"
              >
                Войти
              </Link>
            </div>
          </div>
        </header>

        <section className="surface-hero mt-10 grid items-center gap-8 px-7 py-10 lg:grid-cols-[1.2fr_1fr] lg:px-10 lg:py-12">
          <div>
            <p className="inline-flex rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black">
              Notebook-first AI Analytics
            </p>
            <h1 className="mt-5 text-heading-1 tracking-tight text-foreground sm:text-display sm:leading-[1.05]">
              Drivee Analytics Notebook
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-foreground-secondary">
              AI-платформа self-service аналитики, которая превращает вопрос на обычном языке в SQL, таблицу, график,
              инсайт и прогноз.
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground-secondary">
              Пользователь просто пишет, что хочет узнать: «Покажи выручку по городам за прошлую неделю». Система сама
              интерпретирует запрос, подбирает бизнес-метрики, строит SQL, выполняет его и показывает понятный результат
              с explainability trace.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={"/scenarios" as Route}
                className="interactive-focus rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-black shadow-xs transition hover:bg-brand-400"
              >
                Открыть сценарии
              </Link>
              <Link
                href={"/notebooks/ops-health" as Route}
                className="interactive-focus rounded-full border border-border-subtle bg-surface-card px-6 py-3 text-sm font-semibold text-foreground shadow-xs transition hover:bg-surface-muted"
              >
                Запустить ноутбук
              </Link>
            </div>
          </div>

          <div className="rounded-panel border border-border-subtle bg-surface-muted p-4">
            <div className="rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Product flow snapshot</p>
                <p className="rounded-full bg-brand-500 px-2 py-0.5 text-[11px] font-semibold text-black">Live</p>
              </div>
              <div className="mt-4 space-y-2">
                {["Question", "SQL + Validation", "Chart + Insight", "Trace + History"].map((item, i) => (
                  <div key={item} className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-muted px-3 py-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-[10px] font-semibold text-black">
                      {i + 1}
                    </span>
                    <span className="text-sm text-foreground-secondary">{item}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-border-subtle bg-surface-card p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-foreground-muted">Pipeline quality</p>
                <div className="h-24 w-full rounded-lg bg-surface-muted p-2">
                  <svg viewBox="0 0 260 80" className="h-full w-full" aria-hidden>
                    <polyline fill="none" stroke="currentColor" className="text-chart-1" strokeWidth="3" points="0,60 35,56 70,52 110,42 150,36 190,28 230,20 260,16" />
                    <polyline fill="none" stroke="currentColor" className="text-brand-700" strokeWidth="3" points="0,66 35,61 70,58 110,54 150,48 190,42 230,35 260,31" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <SectionTitle label="О продукте" title="Notebook-first self-service аналитика" subtitle="Drivee Analytics — это notebook-first платформа для бизнес-аналитики, где каждый шаг анализа сохраняется как отдельная ячейка: вопрос → SQL → таблица → график → инсайт → прогноз." />
          <div className="surface-section p-6 sm:p-8">
            <p className="max-w-4xl text-base leading-relaxed text-foreground-secondary">
              Вместо длинного пути “вопрос → аналитик → SQL → график → объяснение” пользователь получает self-service
              инструмент, который делает аналитику быстрее, прозрачнее и доступнее.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={"/templates" as Route}
                className="interactive-focus rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-sm font-semibold text-foreground-secondary shadow-xs transition hover:bg-surface-muted hover:text-foreground"
              >
                Открыть шаблоны
              </Link>
              <Link
                href={"/history" as Route}
                className="interactive-focus rounded-full border border-border-subtle bg-surface-card px-4 py-2 text-sm font-semibold text-foreground-secondary shadow-xs transition hover:bg-surface-muted hover:text-foreground"
              >
                Открыть историю
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <SectionTitle label="Как это работает" title="Прозрачный pipeline от вопроса до решения" subtitle="Ниже — продуктовая диаграмма процесса, встроенная в enterprise UI и полностью адаптированная под текущую дизайн-систему." />
          <div className="surface-section p-5 sm:p-6">
            <div className="rounded-panel border border-border-subtle bg-surface-muted p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-800">
                  Input
                </span>
                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-sky-900">
                  Reasoning
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                  Execution
                </span>
                <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-900">
                  Outcomes
                </span>
              </div>
              <div className="xl:hidden overflow-x-auto pb-2">
                <div className="flex min-w-max items-stretch gap-2 pr-1">
                  {FLOW_STEPS.map((step, idx) => (
                    <div key={step.title} className="flex items-center gap-2">
                      <div className="group w-[220px] rounded-xl border border-border-subtle bg-surface-card p-3 shadow-xs transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Шаг {idx + 1}</p>
                        <p className="mt-1 text-sm font-medium leading-snug text-foreground">{step.title}</p>
                        <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition group-hover:shadow-xs ${FLOW_ZONE_STYLES[step.zone]}`}>
                          {step.zoneLabel}
                        </span>
                      </div>
                      {idx < FLOW_STEPS.length - 1 ? (
                        <div className="flex h-full min-h-[84px] items-center">
                          <div className="rounded-full border border-border-subtle bg-surface-card px-1.5 py-1 shadow-xs transition hover:border-brand-200 hover:bg-brand-50">
                            <svg viewBox="0 0 52 20" className="h-5 w-10 text-brand-700 transition hover:scale-105" aria-hidden>
                              <path d="M2 10 H44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
                              <path d="M36 4 L44 10 L36 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="hidden xl:block">
                <div className="mb-3 rounded-full border border-border-subtle bg-surface-card px-3 py-2 shadow-xs">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full w-[58%] rounded-full bg-brand-500 shadow-[0_0_0_1px_rgba(0,0,0,0.02)] [animation:flowPulse_2.8s_ease-in-out_infinite]" />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                    <span>Question</span>
                    <span>SQL + Validation</span>
                    <span>Insight + Trace</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-2">
                    {FLOW_STEPS.slice(0, 6).map((step, idx) => (
                      <div key={step.title} className="relative">
                        <div className="group rounded-xl border border-border-subtle bg-surface-card p-3 shadow-xs transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Шаг {idx + 1}</p>
                          <p className="mt-1 text-sm font-medium leading-snug text-foreground">{step.title}</p>
                          <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${FLOW_ZONE_STYLES[step.zone]}`}>
                            {step.zoneLabel}
                          </span>
                        </div>
                        {idx < 5 ? (
                          <div className="pointer-events-none absolute -right-[10px] top-1/2 z-10 -translate-y-1/2 rounded-full border border-border-subtle bg-surface-card px-1 py-0.5 shadow-xs">
                            <svg viewBox="0 0 44 18" className="h-4 w-8 text-brand-700" aria-hidden>
                              <path d="M2 9 H36" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                              <path d="M30 4 L36 9 L30 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end pr-2">
                    <div className="rounded-full border border-border-subtle bg-surface-card p-1 shadow-xs">
                      <svg viewBox="0 0 22 34" className="h-7 w-5 text-brand-700" aria-hidden>
                        <path d="M11 3 V27" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                        <path d="M6 21 L11 27 L16 21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                    </div>
                  </div>

                  <div className="grid grid-cols-[repeat(6,minmax(0,1fr))] gap-2">
                    {FLOW_STEPS.slice(6).reverse().map((step, idx) => (
                      <div key={step.title} className="relative">
                        <div className="group rounded-xl border border-border-subtle bg-surface-card p-3 shadow-xs transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Шаг {FLOW_STEPS.findIndex((x) => x.title === step.title) + 1}</p>
                          <p className="mt-1 text-sm font-medium leading-snug text-foreground">{step.title}</p>
                          <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${FLOW_ZONE_STYLES[step.zone]}`}>
                            {step.zoneLabel}
                          </span>
                        </div>
                        {idx < 5 ? (
                          <div className="pointer-events-none absolute -left-[10px] top-1/2 z-10 -translate-y-1/2 rounded-full border border-border-subtle bg-surface-card px-1 py-0.5 shadow-xs">
                            <svg viewBox="0 0 44 18" className="h-4 w-8 text-brand-700" aria-hidden>
                              <path d="M42 9 H8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
                              <path d="M14 4 L8 9 L14 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                            </svg>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <SectionTitle label="Product walkthrough" title="Четыре шага запуска аналитики" subtitle="Короткий сценарий использования для ежедневной работы бизнес-команд." />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {HOW_IT_WORKS.map((item) => (
              <article key={item.title} className="surface-section p-5">
                <h3 className="text-heading-3">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <SectionTitle label="Ключевые возможности" title="Что вы получаете в одном продукте" subtitle="Единый рабочий контур AI-аналитики: от ad-hoc запроса до артефактов для команды." />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {CAPABILITIES.map((item) => (
              <article key={item} className="surface-section p-5">
                <div className="h-2 w-2 rounded-full bg-brand-500 ring-4 ring-brand-500/15" aria-hidden />
                <p className="mt-4 text-base font-semibold text-foreground">{item}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-4 lg:grid-cols-2">
          <div className="surface-section p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-muted">Для кого продукт</p>
            <h3 className="mt-3 text-heading-2 text-foreground">Role-based analytics для всех ключевых ролей</h3>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {ROLES.map((role) => (
                <Link
                  key={role}
                  href={"/scenarios" as Route}
                  className="interactive-focus rounded-control border border-border-subtle bg-surface-muted px-3 py-2 text-sm font-semibold text-foreground-secondary transition hover:bg-surface-card hover:text-foreground"
                >
                  {role}
                </Link>
              ))}
            </div>
          </div>

          <div className="surface-section p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground-muted">Почему это важно</p>
            <h3 className="mt-3 text-heading-2 text-foreground">Быстрее к решению, меньше ручной аналитики</h3>
            <ul className="mt-4 space-y-2">
              {VALUE_POINTS.map((point) => (
                <li key={point} className="rounded-lg border border-border-subtle bg-surface-muted px-3 py-2 text-sm text-foreground-secondary">
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="surface-hero mt-12 border border-brand-200/80 bg-brand-50 px-8 py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground-secondary">Финальный шаг</p>
          <h2 className="text-heading-1 mt-3 max-w-3xl tracking-tight text-foreground sm:text-display sm:leading-tight">
            Задайте вопрос данным на обычном языке
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-foreground-secondary">
            Запускайте аналитику быстрее, находите инсайты без ручного SQL и сохраняйте результаты в notebook, history и
            reports.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={"/scenarios" as Route}
              className="interactive-focus rounded-full bg-brand-500 px-6 py-3 text-sm font-semibold text-black shadow-xs transition hover:bg-brand-400"
            >
              Открыть сценарии
            </Link>
            <Link
              href={"/register" as Route}
              className="interactive-focus rounded-full border border-border-subtle bg-surface-card px-6 py-3 text-sm font-semibold text-foreground shadow-xs transition hover:bg-surface-muted"
            >
              Начать работу
            </Link>
            <Link
              href={"/reports" as Route}
              className="interactive-focus rounded-full border border-border-subtle bg-surface-card px-6 py-3 text-sm font-semibold text-foreground shadow-xs transition hover:bg-surface-muted"
            >
              Смотреть отчеты
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
