import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

const BENEFITS: { title: string; text: string }[] = [
  {
    title: "Умный выбор визуализации",
    text: "Автоматически подбирает тип визуализации по intent, данным и структуре колонок."
  },
  {
    title: "Natural Language + SQL",
    text: "Переходите от вопроса на естественном языке к проверяемому SQL и прозрачной трассировке решения."
  },
  {
    title: "AI Insights",
    text: "Получайте короткие и понятные инсайты с уровнем уверенности, предупреждениями и следующими шагами."
  },
  {
    title: "Гео-режим",
    text: "Анализируйте города и регионы с гео-режимом и качественными fallback-визуализациями."
  }
];

const WORKFLOW: string[] = [
  "Загрузите данные из warehouse или CSV",
  "Сформулируйте вопрос на natural language",
  "AI построит SQL, выполнит запрос и соберет объяснение шагов",
  "Система предложит лучший график и альтернативы",
  "Сохраните результат в отчет и поделитесь с командой"
];

const USE_CASES: { title: string; text: string }[] = [
  {
    title: "Менеджеры",
    text: "Контроль SLA, отмен и операционных KPI в одном dashboard-потоке."
  },
  {
    title: "Руководители",
    text: "Факт vs план, прогнозные коридоры и board-ready отчеты."
  },
  {
    title: "Аналитики",
    text: "Быстрая итерация между prompt, SQL, таблицами и визуализациями."
  },
  {
    title: "Бизнес-команды",
    text: "Единая семантика метрик, прозрачные определения и self-service аналитика."
  }
];

const CITY_SAMPLES = ["Москва", "Санкт-Петербург", "Новосибирск", "Краснодар", "Самара", "Тюмень"];

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
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-black sm:text-[2.6rem] sm:leading-tight">{title}</h2>
      <p className="mt-4 text-base leading-relaxed text-slate-600">{subtitle}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f3f4f6] text-black">
      <div className="mx-auto max-w-7xl px-6 py-10 sm:py-14">
        <header className="rounded-[26px] border border-slate-200 bg-white px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Image
                src="/drivee-logo-v3.png"
                alt="Drive Analytics"
                width={220}
                height={110}
                className="h-10 w-auto rounded-xl bg-black sm:h-12"
                priority
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={"/login" as Route}
                className="interactive-focus rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Войти
              </Link>
              <Link
                href={"/demo-router" as Route}
                className="interactive-focus rounded-full bg-black px-5 py-2 text-sm font-semibold text-white hover:bg-slate-900"
              >
                Открыть демо
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-10 grid items-center gap-8 rounded-[34px] border border-slate-200 bg-white px-7 py-10 lg:grid-cols-[1.15fr_1fr] lg:px-10 lg:py-12">
          <div>
            <p className="inline-flex rounded-full bg-[#b9ff31] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-black">
              AI + Analytics SaaS
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-black sm:text-6xl">
              Аналитика, которая выглядит просто и работает быстро.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Drive Analytics объединяет AI, SQL и dashboard-подход в одном инструменте для менеджеров, аналитиков и
              руководителей.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href={"/demo-router" as Route}
                className="interactive-focus rounded-full bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-slate-900"
              >
                Попробовать демо
              </Link>
              <Link
                href={"/register" as Route}
                className="interactive-focus rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold text-black hover:bg-slate-50"
              >
                Начать работу
              </Link>
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-[#f7f8fa] p-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Обзор аналитики</p>
                <p className="rounded-full bg-[#b9ff31] px-2 py-0.5 text-[11px] font-semibold">Онлайн</p>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2.5">
                {["$184M", "18.4%", "96.8%"].map((kpi) => (
                  <div key={kpi} className="rounded-xl border border-slate-200 bg-[#f8f9fa] px-3 py-2">
                    <p className="text-[10px] uppercase text-slate-500">KPI</p>
                    <p className="mt-1 text-sm font-semibold">{kpi}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <p className="mb-2 text-[11px] uppercase tracking-wide text-slate-500">Динамика</p>
                <div className="h-24 w-full rounded-lg bg-[#f8f9fa] p-2">
                  <svg viewBox="0 0 260 80" className="h-full w-full">
                    <polyline
                      fill="none"
                      stroke="#111"
                      strokeWidth="3"
                      points="0,58 35,50 70,52 110,43 150,36 190,28 230,21 260,18"
                    />
                    <polyline
                      fill="none"
                      stroke="#7aa700"
                      strokeWidth="3"
                      points="0,62 35,60 70,56 110,53 150,50 190,46 230,42 260,38"
                    />
                  </svg>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] uppercase text-slate-500">Структура</p>
                  <div className="mt-2 h-16 w-16 rounded-full border-[8px] border-black border-r-[#b9ff31] border-b-[#d9f987]" />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[10px] uppercase text-slate-500">Тепловая карта</p>
                  <div className="mt-2 grid grid-cols-3 gap-1">
                    {["#edf0f5", "#dff6a3", "#c5f366", "#f1f3f7", "#e6f8bb", "#b9ff31"].map((c, i) => (
                      <div key={i} className="h-5 rounded-md" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <SectionTitle
            label="Преимущества"
            title="Ключевые преимущества"
            subtitle="Фокус на понятной аналитике: меньше лишнего, больше скорости и управляемости."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BENEFITS.map((item) => (
              <article key={item.title} className="rounded-[24px] border border-slate-200 bg-white p-5">
                <div className="h-7 w-7 rounded-lg bg-[#b9ff31]" />
                <h3 className="mt-4 text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <SectionTitle
            label="Продукт"
            title="Превью продуктового экрана"
            subtitle="Единый экран аналитики: фильтры, KPI, графики и таблица для ежедневных решений."
          />
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white">
            <div className="grid min-h-[520px] lg:grid-cols-[220px_1fr]">
              <aside className="border-r border-slate-200 bg-[#f7f8fa] p-4">
                <p className="text-xs font-semibold uppercase text-slate-500">Workspace</p>
                <nav className="mt-4 space-y-1">
                  {["Дашборд", "Статистика", "Отчеты", "Шаблоны", "Гео-аналитика"].map((item, idx) => (
                    <div
                      key={item}
                      className={`rounded-xl px-3 py-2 text-sm ${idx === 0 ? "bg-[#b9ff31] font-semibold text-black" : "text-slate-700"}`}
                    >
                      {item}
                    </div>
                  ))}
                </nav>
              </aside>
              <div className="p-5">
                <div className="flex flex-wrap gap-2">
                  {["Период: Q2", "Регион: Россия", "Сегмент: Enterprise", "Статус: Active"].map((f) => (
                    <span key={f} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700">
                      {f}
                    </span>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {["Выручка", "Отмены", "SLA", "Маржа"].map((kpi, i) => (
                    <div key={kpi} className="rounded-2xl border border-slate-200 bg-[#fbfbfc] p-3">
                      <p className="text-[11px] uppercase text-slate-500">{kpi}</p>
                      <p className="mt-2 text-2xl font-semibold">{["184M", "2.1%", "96.8%", "18.4%"][i]}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold">План vs факт</p>
                    <div className="mt-3 h-36 rounded-xl bg-[#f8f9fb] p-3">
                      <svg viewBox="0 0 300 120" className="h-full w-full">
                        <polyline fill="none" stroke="#0f172a" strokeWidth="3" points="0,90 40,78 80,82 120,70 160,64 200,56 240,48 300,42" />
                        <polyline fill="none" stroke="#97db00" strokeWidth="3" points="0,96 40,89 80,86 120,80 160,74 200,68 240,61 300,56" />
                      </svg>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <p className="text-sm font-semibold">Гео-модуль</p>
                    <div className="mt-3 grid h-36 grid-cols-4 gap-1 rounded-xl bg-[#f8f9fb] p-2">
                      {Array.from({ length: 16 }).map((_, idx) => (
                        <div
                          key={idx}
                          className="rounded-md"
                          style={{ backgroundColor: ["#eef2f7", "#e1f8ab", "#c5f25f", "#f3f4f6"][idx % 4] }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold">Операционная таблица</p>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-slate-600">
                    <div className="font-semibold text-slate-500">Город</div>
                    <div className="font-semibold text-slate-500">Заказы</div>
                    <div className="font-semibold text-slate-500">Отмены</div>
                    <div className="font-semibold text-slate-500">SLA</div>
                    {[
                      ["Алматы", "9,420", "2.0%", "97.1%"],
                      ["Астана", "7,860", "2.3%", "96.4%"],
                      ["Шымкент", "5,140", "2.6%", "95.8%"]
                    ].map((row) =>
                      row.map((cell) => (
                        <div key={`${row[0]}-${cell}`} className="rounded-lg bg-[#f8f9fb] px-2 py-1.5 text-slate-700">
                          {cell}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-16">
          <SectionTitle
            label="Процесс"
            title="Как это работает"
            subtitle="Простой и прозрачный сценарий, который объединяет данные, AI и визуализацию."
          />
          <div className="grid gap-3 md:grid-cols-5">
            {WORKFLOW.map((step, idx) => (
              <article key={step} className="rounded-[22px] border border-slate-200 bg-white p-4">
                <p className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#111111] text-xs font-semibold text-white">
                  {idx + 1}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">{step}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <SectionTitle
            label="Сценарии"
            title="Ключевые сценарии"
            subtitle="Роли получают один продукт, но каждый — свой контур принятия решений."
          />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {USE_CASES.map((item) => (
              <article key={item.title} className="rounded-[24px] border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-[30px] border border-slate-200 bg-white px-8 py-8">
          <SectionTitle
            label="Города и регионы"
            title="Гео-аналитика для городов присутствия"
            subtitle="Используйте city/region срезы в аналитике. При отсутствии координат карта автоматически заменяется на понятный fallback."
          />
          <div className="flex flex-wrap gap-2">
            {CITY_SAMPLES.map((city) => (
              <span key={city} className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                {city}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-[30px] bg-[#b9ff31] px-8 py-10">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/70">Финальный шаг</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-black sm:text-5xl">
            Ускорьте аналитический цикл команды — от вопроса до бизнес-решения.
          </h2>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              href={"/demo-router" as Route}
              className="interactive-focus rounded-full bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Попробовать демо
            </Link>
            <Link
              href={"/register" as Route}
              className="interactive-focus rounded-full border border-black/20 bg-white px-6 py-3 text-sm font-semibold text-black hover:bg-slate-50"
            >
              Начать бесплатно
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
