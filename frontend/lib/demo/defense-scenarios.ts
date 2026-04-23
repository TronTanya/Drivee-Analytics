import type { Route } from "next";

/**
 * Четыре сценария защиты: согласованы с
 * - `backend/scripts/seed_demo_data.py` (шаблоны + история),
 * - `frontend/lib/demo/seeded-data.ts` + ветки `mockRunAnalytics` (контролируемый fallback).
 */
export type DefenseDemoScenario = {
  id: string;
  title: string;
  pitch: string;
  /** Откуда берутся цифры в fallback и что в БД после seed */
  seedDataRu: string;
  nlPrompt: string;
  queryTemplateKey?: string;
  primaryHref: Route;
  secondaryHrefs: { label: string; href: Route }[];
  expectedOutcomeRu: string;
  /** Что происходит при недоступности backend/LLM при профиле Live+fallback */
  fallbackFlowRu: string;
};

export const DEFENSE_DEMO_SCENARIOS: DefenseDemoScenario[] = [
  {
    id: "quick_business",
    title: "Быстрый бизнес-вопрос",
    pitch: "Один NL-запрос → trace → SQL → таблица → график → инсайт за один прогон.",
    seedDataRu:
      "Таблица `anonymized_incity_orders` после миграций + `python -m scripts.seed_demo_data`. Клиентский fallback использует `SEEDED_ORDERS` в `lib/demo/seeded-data.ts`.",
    nlPrompt: "Покажи топ-3 города по количеству отменённых заказов на этой неделе",
    primaryHref: "/notebooks/ops-health" as Route,
    secondaryHrefs: [
      { label: "История", href: "/history" as Route },
      { label: "Словарь", href: "/dictionary" as Route }
    ],
    expectedOutcomeRu:
      "Ранжирование городов по отменам; bar-chart; SQL с FILTER по отменам и окну недели. При live — ответ pipeline; числа зависят от БД.",
    fallbackFlowRu:
      "Запрос к `/api/v1/analytics/run` падает (сеть/5xx/401) → `requestJson` подставляет детерминированный ответ из `mockRunAnalytics` (подпись «Mock dataset» / controlled fallback)."
  },
  {
    id: "comparative",
    title: "Сравнительный анализ",
    pitch: "Две географии, одна метрика доли завершённых — сравнение без ручного SQL.",
    seedDataRu:
      "Те же заказы; для fallback агрегат `comparativeDoneShareAlmatyAstana()` по `SEEDED_ORDERS` только для Алматы и Астаны.",
    nlPrompt: "Сравни долю завершённых заказов Алматы и Астана за последние 14 дней",
    primaryHref: "/notebooks/ops-health" as Route,
    secondaryHrefs: [{ label: "Шаблоны", href: "/templates" as Route }],
    expectedOutcomeRu:
      "Таблица из двух строк (город, done_orders, total_orders, done_share); bar по доле. В live backend интерпретирует запрос и строит SQL к реальной таблице.",
    fallbackFlowRu:
      "Если heuristics в `mockRunAnalytics` распознали «сравни + Алматы + Астана», возвращается отдельная ветка сравнения; иначе — общий ranking-fallback (честно ограниченный демо-набором)."
  },
  {
    id: "regular_reporting",
    title: "Регулярная отчётность",
    pitch: "Операционный срез по дням — прототип ежедневного SLA/отмен.",
    seedDataRu:
      "`dailyCancelledOrdersByDay()` агрегирует отмены из `SEEDED_ORDERS` по календарным дням. В БД эквивалент — шаблон `cancellations_by_period` в seed.",
    nlPrompt: "Сводка для операционного дашборда: отмены по дням за последние 7 дней",
    queryTemplateKey: "cancellations_by_period",
    primaryHref: "/notebooks/ops-health" as Route,
    secondaryHrefs: [
      { label: "Отчёты", href: "/reports" as Route },
      { label: "История", href: "/history" as Route }
    ],
    expectedOutcomeRu:
      "Временной ряд (line) по дням; SQL с date_trunc('day'). В live — фактические даты и объёмы из warehouse.",
    fallbackFlowRu:
      "Ключевые слова «операционн/сводк/по дням + отмен» включают ветку reporting в `mockRunAnalytics`; данные ограничены демо-рядом, не произвольной генерацией."
  },
  {
    id: "collaboration_templates",
    title: "Совместная работа через шаблоны",
    pitch: "Один шаблон workspace — повторяемые запуски разными ролями, история и отчёты.",
    seedDataRu:
      "`ensure_query_templates` создаёт `weekly_cancellations_by_city` и др. История `nl_queries_history` пополняется сценариями защиты.",
    nlPrompt: "Из каталога шаблонов: отмены по городам за неделю (weekly_cancellations_by_city)",
    queryTemplateKey: "weekly_cancellations_by_city",
    primaryHref: "/templates" as Route,
    secondaryHrefs: [
      { label: "Ноутбук", href: "/notebooks/ops-health" as Route },
      { label: "Отчёты", href: "/reports" as Route }
    ],
    expectedOutcomeRu:
      "На `/templates` — быстрый POST run по `template_id`; в ноутбуке тот же смысл через NL с отсылкой к шаблону. Ожидается сопоставимый SQL к `anonymized_incity_orders`.",
    fallbackFlowRu:
      "Ветка «шаблон/каталог/weekly_cancellations» в `mockRunAnalytics` помечает trace как `template · weekly_cancellations_by_city`, данные ranking — те же, что у быстрого вопроса (прозрачно в caption таблицы)."
  }
];
