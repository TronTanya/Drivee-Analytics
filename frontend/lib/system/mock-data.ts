import type { Route } from "next";
import type { UserRole } from "@/lib/types";

const r = (path: string) => path as Route;

export type ScheduleState = "active" | "paused" | "none";

export type SavedReportRow = {
  id: string;
  name: string;
  owner: string;
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
  durationMs: number;
  notebookHref: Route;
  interpretedSummary?: string;
  chartType?: string;
  ownerUserId?: string;
  saveAsReportBodyHint?: Record<string, unknown>;
};

export type QueryTemplateRow = {
  id: string;
  name: string;
  description: string;
  role: UserRole;
  sql: string;
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
    notebookHref: r("/notebooks/nb-q1-bridge"),
    status: "success",
    validationOk: true,
    validationHint: "Все проверки пройдены",
    traceSummary: "Планировщик → anonymized_incity_orders · материализовано 3 ячейки",
    durationMs: 4200
  },
  {
    id: "run-2",
    ranAt: "2026-04-20 09:55",
    notebookTitle: "Операционное здоровье",
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
    id: "qt-1",
    name: "Дневной тренд заказов",
    description: "Заказы по дням за последнюю неделю",
    role: "marketer",
    sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id) AS orders_count FROM public.anonymized_incity_orders WHERE order_timestamp >= CURRENT_DATE - INTERVAL '7 day' GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/campaign-q1")
  },
  {
    id: "qt-2",
    name: "Сводка по нарушениям SLA",
    description: "Склады с нарушением cut-off",
    role: "manager",
    sql: "SELECT warehouse_id, breach_count FROM ops.sla_daily WHERE breach_count > 0",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "qt-3",
    name: "Аудит ролевых прав",
    description: "Кто имеет доступ к PII-таблицам",
    role: "admin",
    sql: "SELECT role, table_name FROM governance.access_matrix WHERE pii = true",
    runHref: r("/notebooks/template-governance")
  },
  {
    id: "qt-4",
    name: "Набор KPI завершения",
    description: "Завершенные поездки и отмены",
    role: "executive",
    sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL) AS done_rides FROM public.anonymized_incity_orders GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/strategy-board")
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
