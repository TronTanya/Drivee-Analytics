import type { Route } from "next";
import type { UserRole } from "@/lib/types";

const r = (path: string) => path as Route;

export type ScheduleState = "active" | "paused" | "none";

export type SavedReportRow = {
  id: string;
  name: string;
  notebookId?: string | null;
  owner: string;
  creatorRoleKey?: string | null;
  updatedAt: string;
  schedule: ScheduleState;
  format: "PDF" | "Slides" | "Notebook" | "CSV";
  href: Route;
  /** Из API saved_reports.has_schedule */
  hasSchedule?: boolean;
};

export type NotebookScenarioRow = {
  id: string;
  name: string;
  notebookId: string;
  owner: string;
  updatedAt: string;
  schedule: ScheduleState;
  href: Route;
};

export type NotebookRunRow = {
  id: string;
  ranAt: string;
  notebookTitle: string;
  /** UUID сценария для ссылок и сохранения отчёта */
  notebookId: string;
  notebookHref: Route;
  status: "success" | "failed" | "partial";
  validationOk: boolean;
  validationHint: string;
  traceSummary: string;
  durationMs: number;
};

export type QueryHistoryRow = {
  id: string;
  ranAt: string;
  label: string;
  sqlPreview: string;
  notebookId: string;
  validationOk: boolean;
  validationHint: string;
  executionStatus?: string;
  durationMs: number;
  notebookHref: Route;
  interpretedSummary?: string;
  chartType?: string;
  parsedIntent?: Record<string, unknown>;
  confidence?: number | null;
  resultSummary?: string | null;
  authorRoleKey?: string | null;
  ownerUserId?: string;
  saveAsReportBodyHint?: Record<string, unknown>;
};

export type QueryTemplateRow = {
  id: string;
  name: string;
  description: string;
  role: UserRole;
  sql: string;
  /** NL-текст для подстановки в сценарий (?template_prompt=) */
  prefillPrompt?: string;
  /** null — показывать во всех ролевых секциях каталога */
  target_role_key?: string | null;
  /** Target notebook for “Quick run” (mock) */
  runHref: Route;
};

export type NotebookTemplateRow = {
  id: string;
  name: string;
  description: string;
  role: UserRole;
  href: Route;
};

export type DictionaryRow = {
  id: string;
  term: string;
  synonyms: string[];
  sqlExpression: string;
  visibility: UserRole[];
  domain?: string;
  canonicalMetricKey?: string;
  sourceTable?: string;
  sourceColumn?: string | null;
  aggregationType?: string;
  termType?: string;
  targetField?: string | null;
  filterValue?: string | null;
  descriptionRu?: string;
  constraints?: Record<string, unknown>;
  exampleQueries?: string[];
  systemInterpretationRu?: string;
};

export const MOCK_SAVED_REPORTS: SavedReportRow[] = [
  {
    id: "rep-1",
    name: "Еженедельный KPI-пак",
    owner: "finance@acme.co",
    updatedAt: "2026-04-20 06:00",
    schedule: "active",
    format: "PDF",
    href: r("/reports")
  },
  {
    id: "rep-2",
    name: "Board deck — completion bridge",
    owner: "cfo@acme.co",
    updatedAt: "2026-04-18 14:22",
    schedule: "paused",
    format: "Slides",
    href: r("/reports")
  },
  {
    id: "rep-3",
    name: "Экспорт отмен по city_id",
    owner: "growth@acme.co",
    updatedAt: "2026-04-17 09:10",
    schedule: "none",
    format: "CSV",
    href: r("/reports")
  }
];

export const MOCK_SCENARIOS: NotebookScenarioRow[] = [
  {
    id: "sc-1",
    name: "Ежедневные операционные исключения",
    notebookId: "nb-ops",
    owner: "ops@acme.co",
    updatedAt: "2026-04-19 23:00",
    schedule: "active",
    href: r("/notebooks/ops-health")
  },
  {
    id: "sc-2",
    name: "Обновление прогноза для руководства",
    notebookId: "nb-strat",
    owner: "strategy@acme.co",
    updatedAt: "2026-04-20 07:30",
    schedule: "active",
    href: r("/notebooks/strategy-board")
  },
  {
    id: "sc-3",
    name: "Лаборатория отмен и завершения",
    notebookId: "nb-mkt",
    owner: "growth@acme.co",
    updatedAt: "2026-04-15 12:00",
    schedule: "none",
    href: r("/notebooks/campaign-q1")
  }
];

export const MOCK_NOTEBOOK_RUNS: NotebookRunRow[] = [
  {
    id: "run-1",
    ranAt: "2026-04-20 10:12",
    notebookTitle: "Q1 completion bridge",
    notebookId: "nb-q1-bridge",
    notebookHref: r("/notebooks/nb-q1-bridge"),
    status: "success",
    validationOk: true,
    validationHint: "Все проверки пройдены",
    traceSummary: "Планировщик → train · материализовано 3 ячейки",
    durationMs: 4200
  },
  {
    id: "run-2",
    ranAt: "2026-04-20 09:55",
    notebookTitle: "Операционное здоровье",
    notebookId: "ops-health",
    notebookHref: r("/notebooks/ops-health"),
    status: "partial",
    validationOk: false,
    validationHint: "Лимит строк",
    traceSummary: "Предупреждение: запрос превысил soft cap; результат усечен до 50k строк",
    durationMs: 9100
  },
  {
    id: "run-3",
    ranAt: "2026-04-19 16:40",
    notebookTitle: "In-city заказы Q1",
    notebookId: "campaign-q1",
    notebookHref: r("/notebooks/campaign-q1"),
    status: "failed",
    validationOk: false,
    validationHint: "Ошибка движка",
    traceSummary: "Таймаут source table при stage scan - рекомендуется повторить",
    durationMs: 30000
  }
];

export const MOCK_QUERY_HISTORY: QueryHistoryRow[] = [
  {
    id: "q-1",
    ranAt: "2026-04-20 08:02",
    label: "Ad-hoc: отмены по city_id",
    sqlPreview: "SELECT city_id, SUM(cancellations) ...",
    notebookId: "nb-q1-bridge",
    validationOk: true,
    validationHint: "Lint OK",
    durationMs: 890,
    notebookHref: r("/notebooks/nb-q1-bridge")
  },
  {
    id: "q-2",
    ranAt: "2026-04-19 11:20",
    label: "Отладка: дублирующиеся ключи",
    sqlPreview: "SELECT user_id, COUNT(*) FROM ...",
    notebookId: "ops-health",
    validationOk: false,
    validationHint: "Риск декартова произведения",
    durationMs: 1200,
    notebookHref: r("/notebooks/ops-health")
  }
];

export const MOCK_QUERY_TEMPLATES: QueryTemplateRow[] = [
  {
    id: "qt-revenue-city",
    name: "Выручка по городам (30 дней)",
    description: "Сумма price_order_local по city_id — как «месяц» в демо-окне",
    role: "executive",
    target_role_key: "executive",
    prefillPrompt: "Покажи выручку по городам за последний месяц",
    sql: "SELECT city_id, SUM(price_order_local)::numeric(18,2) AS revenue_local FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/strategy-board")
  },
  {
    id: "qt-orders-channel",
    name: "Заказы по каналам",
    description: "Сравнение объёма заказов по order_channel",
    role: "marketer",
    target_role_key: "marketer",
    prefillPrompt: "Сравни количество заказов по каналам",
    sql: "SELECT order_channel, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '28 day') GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/campaign-q1")
  },
  {
    id: "qt-cancel-daily",
    name: "Динамика отмен по дням",
    description: "Отмены по дням за 30 дней",
    role: "manager",
    target_role_key: null,
    prefillPrompt: "Покажи динамику отмен по дням",
    sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "qt-top5-revenue",
    name: "Топ-5 городов по выручке",
    description: "SUM(price_order_local), LIMIT 5",
    role: "executive",
    target_role_key: "executive",
    prefillPrompt: "Покажи топ-5 городов по выручке",
    sql: "SELECT city_id, SUM(price_order_local)::numeric(18,2) AS revenue_local FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC LIMIT 5",
    runHref: r("/notebooks/strategy-board")
  },
  {
    id: "qt-week-compare",
    name: "Заказы: неделя к неделе",
    description: "Текущая vs прошлая календарная неделя",
    role: "manager",
    target_role_key: "manager",
    prefillPrompt: "Сравни недели между собой по числу заказов",
    sql: "SELECT COUNT(*) FILTER (WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '7 day' AND order_timestamp < date_trunc('week', CURRENT_DATE))::bigint AS orders_prev_week, COUNT(*) FILTER (WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) AND order_timestamp < date_trunc('week', CURRENT_DATE) + interval '7 day')::bigint AS orders_this_week FROM public.train WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '14 day'",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "qt-avg-check-channel",
    name: "Средний чек по каналам",
    description: "Категория = order_channel (сегмент продаж)",
    role: "marketer",
    target_role_key: "marketer",
    prefillPrompt: "Покажи средний чек по категориям",
    sql: "SELECT order_channel, AVG(price_order_local)::numeric(18,2) AS avg_check FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/campaign-q1")
  },
  {
    id: "qt-cancel-share-city",
    name: "Доля отмен по городам",
    description: "Доля отменённых к заказам по city_id за 14 дней",
    role: "manager",
    target_role_key: null,
    prefillPrompt: "Покажи долю отмен по городам",
    sql: "SELECT city_id, (COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id),0) AS cancellation_rate FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '14 day') GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "qt-orders-trend-30",
    name: "Тренд заказов за 30 дней",
    description: "Число заказов по дням",
    role: "marketer",
    target_role_key: null,
    prefillPrompt: "Покажи тренд заказов за 30 дней",
    sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/campaign-q1")
  }
];

export const MOCK_NOTEBOOK_TEMPLATES: NotebookTemplateRow[] = [
  {
    id: "nt-1",
    name: "Стартовый governance-шаблон",
    description: "Ссылки на словарь и проверки guardrails",
    role: "admin",
    href: r("/notebooks/template-governance")
  },
  {
    id: "nt-2",
    name: "Операционный стендап",
    description: "Исключения, гео, SLA",
    role: "manager",
    href: r("/notebooks/ops-health")
  },
  {
    id: "nt-3",
    name: "In-city диагностика",
    description: "Отмены, завершенные поездки, цена",
    role: "marketer",
    href: r("/notebooks/campaign-q1")
  },
  {
    id: "nt-4",
    name: "Нарратив для совета",
    description: "KPI + прогноз + риски",
    role: "executive",
    href: r("/notebooks/strategy-board")
  }
];

export const MOCK_DICTIONARY: DictionaryRow[] = [
  {
    id: "d-1",
    term: "Отмены клиентом",
    synonyms: ["отмены клиентом", "клиент отменил"],
    sqlExpression: "COUNT(CASE WHEN clientcancel_timestamp IS NOT NULL THEN 1 END)",
    visibility: ["admin", "manager", "marketer", "executive"]
  },
  {
    id: "d-2",
    term: "Завершенные поездки",
    synonyms: ["завершенные поездки", "выполненные поездки"],
    sqlExpression: "COUNT(CASE WHEN driverdone_timestamp IS NOT NULL THEN 1 END)",
    visibility: ["admin", "executive", "manager"]
  },
  {
    id: "d-3",
    term: "Средняя стоимость заказа",
    synonyms: ["средняя стоимость заказа", "средний чек заказа"],
    sqlExpression: "AVG(price_order_local)",
    visibility: ["admin", "marketer", "executive"]
  }
];

export const MOCK_INFERRED_SCHEMA = [
  { name: "city_id", type: "STRING", nullable: false },
  { name: "status_order", type: "STRING", nullable: false },
  { name: "status_tender", type: "STRING", nullable: false },
  { name: "order_timestamp", type: "TIMESTAMP", nullable: false },
  { name: "price_order_local", type: "DECIMAL(12,2)", nullable: false },
  { name: "duration_in_seconds", type: "INTEGER", nullable: false },
  { name: "distance_in_meters", type: "INTEGER", nullable: false }
];

export const MOCK_SAMPLE_ROWS: Record<string, string>[] = [
  {
    city_id: "Алматы",
    status_order: "cancelled",
    status_tender: "client_cancelled",
    order_timestamp: "2026-04-20T08:10:00Z",
    price_order_local: "1850.00",
    duration_in_seconds: "320",
    distance_in_meters: "4200"
  },
  {
    city_id: "Астана",
    status_order: "cancelled",
    status_tender: "driver_timeout",
    order_timestamp: "2026-04-21T07:50:00Z",
    price_order_local: "2350.00",
    duration_in_seconds: "520",
    distance_in_meters: "6100"
  },
  {
    city_id: "Шымкент",
    status_order: "cancelled",
    status_tender: "client_cancelled",
    order_timestamp: "2026-04-21T09:30:00Z",
    price_order_local: "1490.00",
    duration_in_seconds: "260",
    distance_in_meters: "3400"
  }
];
