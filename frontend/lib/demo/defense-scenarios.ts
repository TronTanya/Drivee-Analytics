import type { Route } from "next";

/**
 * Сценарии защиты и курируемые промпты: согласованы с
 * - `backend/scripts/seed_demo_data.py` (шаблоны + история),
 * - `frontend/lib/demo/seeded-data.ts` + ветки `mockRunAnalytics` (детерминированный fallback).
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

/** 7 «красивых» промптов для защиты: стабильный fallback в `mockRunAnalytics` + live pipeline при доступном API. */
export type CuratedDemoPrompt = {
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
  notebookHref: Route;
  /** Для кого удобнее показывать первым */
  fitRoles: ("admin" | "manager" | "marketer" | "executive")[];
};

export const CURATED_DEMO_PROMPTS: CuratedDemoPrompt[] = [
  {
    id: "top_cancel",
    title: "Топ городов по отменам",
    subtitle: "Ranking → horizontal bar / bar, SQL с LIMIT",
    prompt: "Покажи топ-3 города по количеству отменённых заказов на этой неделе",
    notebookHref: "/notebooks/ops-health" as Route,
    fitRoles: ["manager", "admin", "marketer", "executive"]
  },
  {
    id: "compare_cities",
    title: "Сравнение двух городов",
    subtitle: "Comparison → bar, две строки в таблице",
    prompt: "Сравни долю завершённых заказов Алматы и Астана за последние 14 дней",
    notebookHref: "/notebooks/ops-health" as Route,
    fitRoles: ["manager", "marketer", "executive"]
  },
  {
    id: "daily_cancel",
    title: "Операционный ряд отмен",
    subtitle: "Trend → line по дням",
    prompt: "Сводка для операционного дашборда: отмены по дням за последние 7 дней",
    notebookHref: "/notebooks/ops-health" as Route,
    fitRoles: ["manager", "admin"]
  },
  {
    id: "channel_conv",
    title: "Конверсия по каналу",
    subtitle: "Comparison → bar (fallback: фиксированные каналы)",
    prompt: "Покажи конверсию в завершённую поездку по order_channel за 28 дней",
    notebookHref: "/notebooks/ops-health" as Route,
    fitRoles: ["marketer", "manager", "executive"]
  },
  {
    id: "revenue_trend",
    title: "Выручка по дням",
    subtitle: "Trend → line (агрегат по завершённым из seed)",
    prompt: "Покажи выручку по дням за последние 7 дней",
    notebookHref: "/notebooks/ops-health" as Route,
    fitRoles: ["executive", "manager", "marketer"]
  },
  {
    id: "share_cities",
    title: "Структура по городам",
    subtitle: "Share → donut (доли заказов в демо-выборке)",
    prompt: "Покажи структуру заказов по городам (доля)",
    notebookHref: "/notebooks/ops-health" as Route,
    fitRoles: ["executive", "marketer", "manager"]
  },
  {
    id: "geo_map",
    title: "География на карте",
    subtitle: "Geo → map card + mapFeatures (MVP)",
    prompt: "Покажи отмены по городам на карте за последние 30 дней",
    notebookHref: "/notebooks/ops-health" as Route,
    fitRoles: ["manager", "marketer", "executive", "admin"]
  }
];

export const DEFENSE_DEMO_SCENARIOS: DefenseDemoScenario[] = [
  {
    id: "quick_business",
    title: "Быстрый бизнес-вопрос",
    pitch: "Один NL-запрос → trace → SQL → таблица → график → инсайт за один прогон.",
    seedDataRu:
      "Канонический источник аналитики — **`public.train`** (VIEW над факт-таблицей заказов). После миграций + `python -m scripts.seed_demo_data`. Клиентский fallback использует `SEEDED_ORDERS` в `lib/demo/seeded-data.ts`.",
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
      "На `/templates` — быстрый POST run по `template_id`; в ноутбуке тот же смысл через NL с отсылкой к шаблону. Ожидается SQL к **`public.train`**.",
    fallbackFlowRu:
      "Ветка «шаблон/каталог/weekly_cancellations» в `mockRunAnalytics` помечает trace как `template · weekly_cancellations_by_city`, данные ranking — те же, что у быстрого вопроса (прозрачно в caption таблицы)."
  },
  {
    id: "marketer_channel_conversion",
    title: "Маркетинг: конверсия по каналу",
    pitch: "Сравнение каналов привлечения — bar chart и детерминированный fallback.",
    seedDataRu: "Ветка `isChannelConversion` в `mockRunAnalytics` + `demoChannelFunnelRows()`; в live — `order_channel` из warehouse.",
    nlPrompt: "Покажи конверсию в завершённую поездку по order_channel за 28 дней",
    primaryHref: "/notebooks/ops-health" as Route,
    secondaryHrefs: [
      { label: "Шаблоны", href: "/templates" as Route },
      { label: "История", href: "/history" as Route }
    ],
    expectedOutcomeRu: "Таблица по каналам; bar по conversion; SQL-шаблон с GROUP BY order_channel.",
    fallbackFlowRu: "При сбое API — фиксированные три канала (app/web/partner) из клиентского мока."
  },
  {
    id: "executive_revenue_trend",
    title: "Руководитель: выручка по дням",
    pitch: "Краткий тренд выручки — line chart; в fallback агрегат из завершённых заказов SEEDED_ORDERS.",
    seedDataRu: "`dailyRevenueDoneByDay()` в `seeded-data.ts`; ветка `isRevenueTrend` в `mockRunAnalytics`.",
    nlPrompt: "Покажи выручку по дням за последние 7 дней",
    primaryHref: "/notebooks/ops-health" as Route,
    secondaryHrefs: [{ label: "Отчёты", href: "/reports" as Route }],
    expectedOutcomeRu: "Временной ряд; line; при live — SUM(price) по завершённым из БД.",
    fallbackFlowRu: "Ключевые слова выручка + по дням/неделе → отдельная ветка мока, не случайные числа."
  },
  {
    id: "geo_map_mvp",
    title: "География: карта + рейтинг",
    pitch: "Запрос с «картой» и городами — map-ready payload (mapFeatures) и geo card в UI.",
    seedDataRu: "Ветка `isGeoMapDemo` в `mockRunAnalytics`; `mapFeatures` из топа городов по отменам.",
    nlPrompt: "Покажи отмены по городам на карте за последние 30 дней",
    primaryHref: "/notebooks/ops-health" as Route,
    secondaryHrefs: [{ label: "Словарь", href: "/dictionary" as Route }],
    expectedOutcomeRu: "chartType map, geoMetadata; при live — тот же смысл через pipeline + guardrails.",
    fallbackFlowRu: "Fallback не ломает защиту: те же цифры, что в ranking, плюс структура для карты."
  }
];
