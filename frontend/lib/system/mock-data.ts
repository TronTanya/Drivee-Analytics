import type { Route } from "next";
import type { QueryTemplateDto } from "@/types/api/templates";
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
  /** Краткий заголовок карточки (если не задан — используется name). */
  title?: string;
  name: string;
  description: string;
  /** Роль-владелец шаблона в каталоге. */
  role: UserRole;
  /** Текст запроса для NL→SQL pipeline. */
  question: string;
  /** Ожидаемый тип графика (bar | line | area | pie | table | …). */
  expected_chart: string;
  /** Почему шаблон полезен бизнесу. */
  business_value: string;
  tags: string[];
  /** Подходит как повторяемый стартовый сценарий. */
  reusable_scenario: boolean;
  sql: string;
  /** Notebook id для запуска (без пути). */
  notebookId: string;
  /** null — показывать во всех ролевых секциях каталога */
  target_role_key?: UserRole | null;
  /** Маршрут канвы сценария */
  runHref: Route;
  /** Доп. блок для demo: как система интерпретировала вопрос. */
  interpretedIntent?: string;
  /** Превью табличного результата для карточки demo. */
  tableResultPreview?: Array<Record<string, string | number | null>>;
  /** Уверенность NL→SQL для demo-кейса. */
  confidenceScore?: number;
  /** Explainability trace шаги для demo-кейса. */
  explainabilityTrace?: string[];
  /** Короткий insight для demo-кейса. */
  shortInsight?: string;
};

export function queryTemplateRowToDto(row: QueryTemplateRow): QueryTemplateDto {
  return {
    id: row.id,
    title: row.title ?? row.name,
    name: row.name,
    description: row.description,
    role: row.role,
    question: row.question,
    expected_chart: row.expected_chart,
    business_value: row.business_value,
    tags: row.tags,
    reusable_scenario: row.reusable_scenario,
    sql: row.sql,
    default_notebook_id: row.notebookId,
    template_key: row.id,
    nl_prompt_template: row.question,
    sql_template: row.sql,
    default_chart_type: row.expected_chart,
    target_role_key: row.target_role_key ?? null
  };
}

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
    id: "qt-admin-status-mix",
    name: "Заказы по статусам (14 дней)",
    description: "Распределение по status_order для аудита воронки.",
    question: "Покажи количество заказов по статусам за последние 14 дней",
    role: "admin",
    target_role_key: "admin",
    expected_chart: "bar",
    business_value: "Контроль качества данных и «здоровья» статусов на платформе.",
    tags: ["статус", "админ", "воронка"],
    reusable_scenario: true,
    notebookId: "template-governance",
    sql: "SELECT status_order, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '14 day' GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/template-governance")
  },
  {
    id: "qt-admin-cancel-split",
    name: "Отмены: клиент vs водитель",
    description: "Сравнение clientcancel и drivercancel за 30 дней.",
    question: "Сравни отмены клиента и отмены водителя за последние 30 дней",
    role: "admin",
    target_role_key: "admin",
    expected_chart: "bar",
    business_value: "Баланс причин отмен для операционной и продуктовой диагностики.",
    tags: ["отмены", "админ", "SLA"],
    reusable_scenario: true,
    notebookId: "template-governance",
    sql: "SELECT COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL)::bigint AS client_cancels, COUNT(*) FILTER (WHERE drivercancel_timestamp IS NOT NULL)::bigint AS driver_cancels FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '30 day'",
    runHref: r("/notebooks/template-governance")
  },
  {
    id: "qt-admin-platform-daily",
    name: "Платформа: заказы по дням (14 дней)",
    description: "Суточный объём заказов для мониторинга нагрузки.",
    question: "Покажи суточный объём заказов на платформе за последние 14 дней",
    role: "admin",
    target_role_key: "admin",
    expected_chart: "line",
    business_value: "Быстрый health-check объёма без срезов по ролям пользователей продукта.",
    tags: ["платформа", "объём", "14д"],
    reusable_scenario: true,
    notebookId: "template-governance",
    sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '14 day' GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/template-governance")
  },
  {
    id: "qt-admin-top-cities-orders",
    name: "Топ городов по заказам (30 дней)",
    description: "Ранжирование city_id по числу заказов.",
    question: "Покажи топ городов по количеству заказов за 30 дней",
    role: "admin",
    target_role_key: "admin",
    expected_chart: "bar",
    business_value: "Балансировка инфраструктуры и поддержки по географии спроса.",
    tags: ["город", "топ", "админ"],
    reusable_scenario: true,
    notebookId: "template-governance",
    sql: "SELECT city_id::text, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '30 day' GROUP BY 1 ORDER BY 2 DESC LIMIT 12",
    runHref: r("/notebooks/template-governance")
  },
  {
    id: "qt-admin-duration-daily",
    name: "Средняя длительность по дням (30 дней)",
    description: "SLA-прокси: AVG(duration_in_seconds) по дням.",
    question: "Покажи среднюю длительность поездки по дням за 30 дней",
    role: "admin",
    target_role_key: "admin",
    expected_chart: "line",
    business_value: "Выявить деградацию сервиса по времени выполнения заказа.",
    tags: ["SLA", "длительность", "админ"],
    reusable_scenario: true,
    notebookId: "template-governance",
    sql: "SELECT date_trunc('day', order_timestamp)::date AS day, AVG(duration_in_seconds)::numeric(18,2) AS avg_duration_sec FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '30 day' AND duration_in_seconds IS NOT NULL GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/template-governance")
  },
  {
    id: "qt-admin-drivee-pass-daily",
    name: "Drivee: средние дневные заказы пассажира по городам",
    description: "Дневной агрегат pass_detail → таблица passenger_daily_metrics (после импорта CSV).",
    question: "Покажи по городам среднее число дневных заказов пассажира в passenger_daily_metrics",
    role: "admin",
    target_role_key: "admin",
    expected_chart: "bar",
    business_value: "Связка заказов (train) с дневными профилями пассажиров (Drivee CSV).",
    tags: ["Drivee", "pass_detail", "админ"],
    reusable_scenario: false,
    notebookId: "template-governance",
    sql: "SELECT city_id, AVG(orders_count)::numeric(18,4) AS avg_daily_orders FROM public.passenger_daily_metrics GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 20",
    runHref: r("/notebooks/template-governance")
  },
  {
    id: "qt-admin-drivee-driver-daily",
    name: "Drivee: сумма поездок водителей по городам",
    description: "Дневной агрегат driver_detail → таблица driver_daily_metrics.",
    question: "Покажи по городам сумму rides_count из дневных метрик водителей",
    role: "admin",
    target_role_key: "admin",
    expected_chart: "bar",
    business_value: "География активности водителей по завершённым поездкам.",
    tags: ["Drivee", "driver_detail", "админ"],
    reusable_scenario: false,
    notebookId: "template-governance",
    sql: "SELECT city_id, SUM(rides_count)::numeric(18,2) AS rides_sum FROM public.driver_daily_metrics GROUP BY 1 ORDER BY 2 DESC NULLS LAST LIMIT 20",
    runHref: r("/notebooks/template-governance")
  },
  {
    id: "qt-revenue-city-last-week",
    name: "Выручка по городам за прошлую неделю",
    description: "Сумма price_order_local по city_id в окне прошлой календарной недели.",
    question: "Покажи выручку по городам за прошлую неделю",
    role: "manager",
    target_role_key: "manager",
    expected_chart: "bar",
    business_value: "Сравнить вклад городов после промо и скорректировать локальные SLA.",
    tags: ["выручка", "город", "неделя"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT city_id::text, SUM(price_order_local)::numeric(18,2) AS revenue FROM public.train WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - INTERVAL '7 day' AND order_timestamp < date_trunc('week', CURRENT_DATE) GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "qt-revenue-by-month",
    name: "Динамика выручки по месяцам",
    description: "Агрегат выручки по календарным месяцам за последние 12 месяцев.",
    question: "Покажи динамику выручки по месяцам за последний год",
    role: "executive",
    target_role_key: "executive",
    expected_chart: "line",
    business_value: "Увидеть сезонность и тренд для планирования выручки и бюджета.",
    tags: ["выручка", "месяц", "тренд"],
    reusable_scenario: true,
    notebookId: "strategy-board",
    sql: "SELECT date_trunc('month', order_timestamp)::date AS month, SUM(price_order_local)::numeric(18,2) AS revenue FROM public.train WHERE order_timestamp >= date_trunc('month', CURRENT_DATE) - INTERVAL '12 month' GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/strategy-board")
  },
  {
    id: "qt-orders-by-day",
    name: "Количество заказов по дням",
    description: "Число уникальных заказов по календарным дням.",
    question: "Покажи количество заказов по дням за последние 30 дней",
    role: "manager",
    target_role_key: "manager",
    expected_chart: "line",
    business_value: "Операционный контроль объёма и выявление провалов по дням.",
    tags: ["заказы", "день", "объём"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '30 day' GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "qt-avg-check-by-channel",
    name: "Средний чек по каналам",
    description: "Среднее price_order_local в разрезе order_channel.",
    question: "Покажи средний чек по каналам привлечения за последние 28 дней",
    role: "marketer",
    target_role_key: "marketer",
    expected_chart: "bar",
    business_value: "Оценить качество трафика и эффективность маркетинговых каналов.",
    tags: ["чек", "канал", "маркетинг"],
    reusable_scenario: true,
    notebookId: "campaign-q1",
    sql: "SELECT order_channel, AVG(price_order_local)::numeric(18,2) AS avg_check FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '28 day' GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/campaign-q1")
  },
  {
    id: "qt-top10-cities-orders",
    name: "Топ-10 городов по заказам",
    description: "Рейтинг city_id по числу заказов за выбранное окно.",
    question: "Покажи топ-10 городов по количеству заказов за последние 14 дней",
    role: "manager",
    target_role_key: "manager",
    expected_chart: "bar",
    business_value: "Сфокусировать операционные ресурсы на крупнейших хабах спроса.",
    tags: ["топ", "город", "заказы"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT city_id::text, COUNT(DISTINCT order_id)::bigint AS orders FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '14 day' GROUP BY 1 ORDER BY 2 DESC LIMIT 10",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "qt-order-status-mix",
    name: "Доля статусов заказов",
    description: "Распределение заказов по status_order (доли / counts).",
    question: "Покажи долю заказов по статусам за последние 30 дней",
    role: "manager",
    target_role_key: "manager",
    expected_chart: "pie",
    business_value: "Понять «здоровье» воронки: отмены, завершения, в пути.",
    tags: ["статус", "доля", "воронка"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT status_order, COUNT(DISTINCT order_id)::bigint AS cnt FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '30 day' GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "qt-marketer-revenue-channel",
    name: "Выручка по каналам (28 дней)",
    description: "Сумма price_order_local по order_channel.",
    question: "Покажи выручку по каналам привлечения за 28 дней",
    role: "marketer",
    target_role_key: "marketer",
    expected_chart: "bar",
    business_value: "Связать маркетинговые каналы с деньгами, а не только с кликами.",
    tags: ["выручка", "канал", "маркетинг"],
    reusable_scenario: true,
    notebookId: "campaign-q1",
    sql: "SELECT order_channel, SUM(price_order_local)::numeric(18,2) AS revenue_local, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '28 day' GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/campaign-q1")
  },
  {
    id: "qt-channel-efficiency",
    name: "Эффективность каналов",
    description: "Конверсия в завершённую поездку и объём по order_channel.",
    question: "Покажи эффективность каналов: заказы и конверсия в завершённые за 28 дней",
    role: "marketer",
    target_role_key: "marketer",
    expected_chart: "bar",
    business_value: "Сравнить каналы по качеству, а не только по кликам и лидам.",
    tags: ["канал", "конверсия", "эффективность"],
    reusable_scenario: true,
    notebookId: "campaign-q1",
    sql: "SELECT order_channel, COUNT(DISTINCT order_id)::bigint AS orders, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL)::bigint AS completed FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '28 day' GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/campaign-q1")
  },
  {
    id: "qt-marketer-done-by-channel",
    name: "Завершённые поездки по каналу (28 дней)",
    description: "Число завершённых поездок в разрезе order_channel.",
    question: "Покажи количество завершённых поездок по каналам за 28 дней",
    role: "marketer",
    target_role_key: "marketer",
    expected_chart: "bar",
    business_value: "Сопоставить каналы привлечения с реальными завершёнными поездками.",
    tags: ["канал", "завершения", "маркетинг"],
    reusable_scenario: true,
    notebookId: "campaign-q1",
    sql: "SELECT order_channel, COUNT(*) FILTER (WHERE driverdone_timestamp IS NOT NULL)::bigint AS done_rides FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '28 day' GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/campaign-q1")
  },
  {
    id: "qt-marketer-client-cancel-channel",
    name: "Доля отмен клиента по каналу (28 дней)",
    description: "Отношение отмен клиента к заказам по order_channel.",
    question: "Покажи долю отмен клиента по каналам за 28 дней",
    role: "marketer",
    target_role_key: "marketer",
    expected_chart: "bar",
    business_value: "Понять, какие каналы дают больше отказов до сервиса.",
    tags: ["отмены", "канал", "маркетинг"],
    reusable_scenario: true,
    notebookId: "campaign-q1",
    sql: "SELECT order_channel, (COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id), 0) AS client_cancel_rate FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '28 day' GROUP BY 1 ORDER BY 2 DESC",
    runHref: r("/notebooks/campaign-q1")
  },
  {
    id: "qt-exec-weekly-revenue",
    name: "Выручка по неделям",
    description: "Сумма price_order_local по календарным неделям за 4 недели.",
    question: "Покажи выручку по неделям за последние четыре недели",
    role: "executive",
    target_role_key: "executive",
    expected_chart: "line",
    business_value: "Короткий горизонт для совещаний руководства и контроля тренда.",
    tags: ["выручка", "неделя", "KPI"],
    reusable_scenario: true,
    notebookId: "strategy-board",
    sql: "SELECT date_trunc('week', order_timestamp)::date AS week_start, SUM(price_order_local)::numeric(18,2) AS revenue_local FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '28 day' GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/strategy-board")
  },
  {
    id: "qt-revenue-forecast",
    name: "Прогноз выручки",
    description: "Ряд выручки по дням + baseline-прогноз на горизонт (оркестратор).",
    question: "Покажи прогноз выручки на следующую неделю по дням с таблицей и кратким предупреждением при низком качестве ряда",
    role: "executive",
    target_role_key: "executive",
    expected_chart: "line",
    business_value: "Короткий горизонтный сценарий для совещаний и cash-visibility.",
    tags: ["прогноз", "выручка", "тренд"],
    reusable_scenario: false,
    notebookId: "strategy-board",
    sql: "SELECT date_trunc('day', order_timestamp)::date AS day, SUM(price_order_local)::numeric(18,2) AS revenue FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '60 day' GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/strategy-board")
  },
  {
    id: "qt-exec-orders-weekly",
    name: "Заказы по неделям (8 недель)",
    description: "Число заказов по календарной неделе.",
    question: "Покажи динамику числа заказов по неделям за последние 8 недель",
    role: "executive",
    target_role_key: "executive",
    expected_chart: "line",
    business_value: "Объём спроса на уровне совета без операционной детализации.",
    tags: ["заказы", "неделя", "KPI"],
    reusable_scenario: true,
    notebookId: "strategy-board",
    sql: "SELECT date_trunc('week', order_timestamp)::date AS week_start, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '56 day' GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/strategy-board")
  },
  {
    id: "qt-exec-revenue-orders-summary",
    name: "Выручка и заказы за 30 дней (сводка)",
    description: "Один ряд: сумма выручки и число заказов.",
    question: "Покажи суммарную выручку и число заказов за последние 30 дней",
    role: "executive",
    target_role_key: "executive",
    expected_chart: "table",
    business_value: "Короткий снимок для брифинга руководства.",
    tags: ["сводка", "выручка", "KPI"],
    reusable_scenario: true,
    notebookId: "strategy-board",
    sql: "SELECT SUM(price_order_local)::numeric(18,2) AS revenue_30d, COUNT(DISTINCT order_id)::bigint AS orders_30d FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '30 day'",
    runHref: r("/notebooks/strategy-board")
  },
  {
    id: "qt-city-anomalies",
    name: "Аномалии по городам",
    description: "Сравнение отмен / заказов по city_id с отклонениями от среднего.",
    question: "Покажи города с аномальным ростом или падением отмен за последние 14 дней",
    role: "manager",
    target_role_key: "manager",
    expected_chart: "bar",
    business_value: "Раннее выявление локальных сбоев и проблем канала в городе.",
    tags: ["аномалия", "город", "отмены"],
    reusable_scenario: false,
    notebookId: "ops-health",
    sql: "SELECT city_id::text, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations, COUNT(DISTINCT order_id)::bigint AS orders FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '14 day' GROUP BY 1 HAVING COUNT(DISTINCT order_id) > 50 ORDER BY 2 DESC",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "qt-manager-weekly-pack",
    name: "Отчёт для менеджера за неделю",
    description: "Сводка: заказы, выручка, отмены за текущую календарную неделю.",
    question: "Собери отчёт для менеджера за текущую неделю: заказы, выручка и отмены по дням",
    role: "manager",
    target_role_key: "manager",
    expected_chart: "line",
    business_value: "Один запуск закрывает еженедельный операционный бриф без ручной сборки.",
    tags: ["отчёт", "неделя", "сводка"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders, SUM(price_order_local)::numeric(18,2) AS revenue, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.train WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) GROUP BY 1 ORDER BY 1",
    runHref: r("/notebooks/ops-health")
  },
  {
    id: "drivee-demo-01-revenue-city-week",
    name: "Drivee Demo: выручка по городам (7 дней)",
    description: "Демо-кейс incity_orders: выручка по городам за последнюю неделю.",
    question: "Покажи выручку по городам за последнюю неделю",
    role: "manager",
    expected_chart: "bar",
    business_value: "Быстрое сравнение вкладов городов в revenue.",
    tags: ["drivee", "demo", "revenue", "city"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT city_id, SUM(price_order_local) AS revenue FROM incity_orders WHERE order_timestamp >= CURRENT_DATE - INTERVAL '7 days' GROUP BY city_id ORDER BY revenue DESC",
    runHref: r("/notebooks/ops-health"),
    interpretedIntent: "trend + comparison (метрика revenue, группировка city_id, период 7 дней)",
    confidenceScore: 0.92,
    shortInsight: "Города-лидеры формируют основную долю недельной выручки.",
    tableResultPreview: [{ city_id: "67", revenue: 1245030.5 }, { city_id: "12", revenue: 984210.2 }, { city_id: "78", revenue: 745430.9 }],
    explainabilityTrace: [
      "Метрика: выручка → SUM(price_order_local)",
      "Группировка: по городам → GROUP BY city_id",
      "Период: последняя неделя → CURRENT_DATE - INTERVAL '7 days'",
      "Источник: incity_orders",
      "График: bar",
      "SQL validation: passed",
      "Confidence: 0.92"
    ]
  },
  {
    id: "drivee-demo-02-orders-daily",
    name: "Drivee Demo: динамика заказов по дням",
    description: "Демо-кейс incity_orders: количество заказов по дням.",
    question: "Покажи динамику заказов по дням",
    role: "manager",
    expected_chart: "line",
    business_value: "Понимание краткосрочных колебаний спроса.",
    tags: ["drivee", "demo", "orders", "trend"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT DATE(order_timestamp) AS date, COUNT(DISTINCT order_id) AS orders_count FROM incity_orders GROUP BY DATE(order_timestamp) ORDER BY date",
    runHref: r("/notebooks/ops-health"),
    interpretedIntent: "trend (метрика orders_count, временная ось day)",
    confidenceScore: 0.9,
    shortInsight: "После выходных заметен рост дневного объёма заказов.",
    tableResultPreview: [{ date: "2026-04-18", orders_count: 18234 }, { date: "2026-04-19", orders_count: 17601 }, { date: "2026-04-20", orders_count: 19102 }],
    explainabilityTrace: [
      "Метрика: заказы → COUNT(DISTINCT order_id)",
      "Временной срез: по дням → DATE(order_timestamp)",
      "Источник: incity_orders",
      "График: line",
      "Guardrails: select-only, whitelist tables",
      "SQL validation: passed",
      "Confidence: 0.90"
    ]
  },
  {
    id: "drivee-demo-03-active-passengers-city",
    name: "Drivee Demo: активные пассажиры по городам",
    description: "Демо-кейс passenger_daily_metrics: активные пассажиры.",
    question: "Покажи активных пассажиров по городам",
    role: "manager",
    expected_chart: "bar",
    business_value: "Показывает где выше вовлечённость клиентской базы.",
    tags: ["drivee", "demo", "passengers", "city"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT city_id, COUNT(DISTINCT user_id) AS active_passengers FROM passenger_daily_metrics WHERE orders_count > 0 GROUP BY city_id ORDER BY active_passengers DESC",
    runHref: r("/notebooks/ops-health"),
    interpretedIntent: "comparison (активность пассажиров по city_id)",
    confidenceScore: 0.88,
    shortInsight: "Топ-города по активным пассажирам совпадают с лидерами по заказам.",
    tableResultPreview: [{ city_id: "67", active_passengers: 58214 }, { city_id: "12", active_passengers: 44301 }, { city_id: "78", active_passengers: 31804 }],
    explainabilityTrace: [
      "Сущность: активные пассажиры → COUNT(DISTINCT user_id) WHERE orders_count > 0",
      "Группировка: city_id",
      "Источник: passenger_daily_metrics",
      "График: bar",
      "SQL validation: passed",
      "Confidence: 0.88"
    ]
  },
  {
    id: "drivee-demo-04-active-drivers-day",
    name: "Drivee Demo: активные водители по дням",
    description: "Демо-кейс driver_daily_metrics: активные водители по дням.",
    question: "Покажи активных водителей по дням",
    role: "manager",
    expected_chart: "line",
    business_value: "Контроль supply-плеча по дням.",
    tags: ["drivee", "demo", "drivers", "trend"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT tender_date_part AS date, COUNT(DISTINCT driver_id) AS active_drivers FROM driver_daily_metrics WHERE online_time_sum_seconds > 0 GROUP BY tender_date_part ORDER BY date",
    runHref: r("/notebooks/ops-health"),
    interpretedIntent: "trend (активность водителей во времени)",
    confidenceScore: 0.89,
    shortInsight: "Активность водителей растёт в пиковые дни спроса.",
    tableResultPreview: [{ date: "2026-04-18", active_drivers: 12704 }, { date: "2026-04-19", active_drivers: 13210 }, { date: "2026-04-20", active_drivers: 13802 }],
    explainabilityTrace: [
      "Сущность: активные водители → COUNT(DISTINCT driver_id) WHERE online_time_sum_seconds > 0",
      "Временной срез: tender_date_part",
      "Источник: driver_daily_metrics",
      "График: line",
      "SQL validation: passed",
      "Confidence: 0.89"
    ]
  },
  {
    id: "drivee-demo-05-cancel-after-accept",
    name: "Drivee Demo: отмены после принятия",
    description: "Демо-кейс passenger_daily_metrics: отмены после принятия.",
    question: "Покажи отмены пассажиров после принятия",
    role: "manager",
    expected_chart: "line",
    business_value: "Показатель потерь после стадии принятия заказа.",
    tags: ["drivee", "demo", "cancel", "trend"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT order_date_part AS date, SUM(client_cancel_after_accept) AS cancels_after_accept FROM passenger_daily_metrics GROUP BY order_date_part ORDER BY date",
    runHref: r("/notebooks/ops-health"),
    interpretedIntent: "trend (cancel_after_accept по дням)",
    confidenceScore: 0.87,
    shortInsight: "Нужно проверить города с пиками post-accept cancel.",
    tableResultPreview: [{ date: "2026-04-18", cancels_after_accept: 420 }, { date: "2026-04-19", cancels_after_accept: 398 }, { date: "2026-04-20", cancels_after_accept: 451 }],
    explainabilityTrace: [
      "Метрика: отмены после принятия → SUM(client_cancel_after_accept)",
      "Временной срез: order_date_part",
      "Источник: passenger_daily_metrics",
      "График: line",
      "SQL validation: passed",
      "Confidence: 0.87"
    ]
  },
  {
    id: "drivee-demo-06-ride-conversion",
    name: "Drivee Demo: конверсия заказов в поездки",
    description: "Демо-кейс passenger_daily_metrics: ride conversion по городам.",
    question: "Покажи конверсию заказов в поездки",
    role: "manager",
    expected_chart: "bar",
    business_value: "Сравнение эффективности выполнения заказов по городам.",
    tags: ["drivee", "demo", "conversion"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT city_id, SUM(rides_count)::numeric / NULLIF(SUM(orders_count), 0) AS ride_conversion FROM passenger_daily_metrics GROUP BY city_id ORDER BY ride_conversion DESC",
    runHref: r("/notebooks/ops-health"),
    interpretedIntent: "comparison (ratio metric ride_conversion)",
    confidenceScore: 0.9,
    shortInsight: "Разница конверсии по городам указывает на локальные операционные факторы.",
    tableResultPreview: [{ city_id: "67", ride_conversion: 0.82 }, { city_id: "12", ride_conversion: 0.79 }, { city_id: "78", ride_conversion: 0.76 }],
    explainabilityTrace: [
      "Метрика: ride_conversion = SUM(rides_count)/SUM(orders_count)",
      "Группировка: city_id",
      "Источник: passenger_daily_metrics",
      "График: bar",
      "Guardrails: role-safe aggregated output",
      "Confidence: 0.90"
    ]
  },
  {
    id: "drivee-demo-07-avg-order-price-city",
    name: "Drivee Demo: средняя стоимость поездки по городам",
    description: "Демо-кейс incity_orders: AVG(price_order_local).",
    question: "Покажи среднюю стоимость поездки по городам",
    role: "manager",
    expected_chart: "bar",
    business_value: "Сравнение ценовой структуры между городами.",
    tags: ["drivee", "demo", "avg_price"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT city_id, AVG(price_order_local) AS avg_order_price FROM incity_orders WHERE price_order_local IS NOT NULL GROUP BY city_id ORDER BY avg_order_price DESC",
    runHref: r("/notebooks/ops-health"),
    interpretedIntent: "ranking (avg order price by city)",
    confidenceScore: 0.91,
    shortInsight: "Города с высоким средним чеком требуют отдельной pricing-стратегии.",
    tableResultPreview: [{ city_id: "67", avg_order_price: 3120.5 }, { city_id: "12", avg_order_price: 2860.1 }, { city_id: "78", avg_order_price: 2510.6 }],
    explainabilityTrace: [
      "Метрика: средняя стоимость поездки → AVG(price_order_local)",
      "Группировка: city_id",
      "Источник: incity_orders",
      "График: bar",
      "SQL validation: passed",
      "Confidence: 0.91"
    ]
  },
  {
    id: "drivee-demo-08-top10-rides-city",
    name: "Drivee Demo: топ-10 городов по поездкам",
    description: "Демо-кейс passenger_daily_metrics: SUM(rides_count), top 10.",
    question: "Покажи топ-10 городов по количеству поездок",
    role: "manager",
    expected_chart: "horizontal_bar",
    business_value: "Ранжирование крупнейших ride-хабов.",
    tags: ["drivee", "demo", "top10", "rides"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT city_id, SUM(rides_count) AS rides_count FROM passenger_daily_metrics GROUP BY city_id ORDER BY rides_count DESC LIMIT 10",
    runHref: r("/notebooks/ops-health"),
    interpretedIntent: "ranking (top cities by rides)",
    confidenceScore: 0.93,
    shortInsight: "Первые 10 городов аккумулируют основной объём поездок.",
    tableResultPreview: [{ city_id: "67", rides_count: 185002 }, { city_id: "12", rides_count: 142889 }, { city_id: "78", rides_count: 120311 }],
    explainabilityTrace: [
      "Метрика: поездки → SUM(rides_count)",
      "Ранжирование: ORDER BY rides_count DESC LIMIT 10",
      "Источник: passenger_daily_metrics",
      "График: horizontal_bar",
      "SQL validation: passed",
      "Confidence: 0.93"
    ]
  },
  {
    id: "drivee-demo-09-driver-online-hours",
    name: "Drivee Demo: среднее время онлайн водителей",
    description: "Демо-кейс driver_daily_metrics: avg online hours by city.",
    question: "Покажи среднее время онлайн водителей",
    role: "manager",
    expected_chart: "bar",
    business_value: "Контроль фактического driver supply по городам.",
    tags: ["drivee", "demo", "online", "drivers"],
    reusable_scenario: true,
    notebookId: "ops-health",
    sql: "SELECT city_id, AVG(online_time_sum_seconds) / 3600.0 AS avg_online_hours FROM driver_daily_metrics GROUP BY city_id ORDER BY avg_online_hours DESC",
    runHref: r("/notebooks/ops-health"),
    interpretedIntent: "comparison (avg online hours by city)",
    confidenceScore: 0.88,
    shortInsight: "Разброс по online-hours указывает на неравномерность supply.",
    tableResultPreview: [{ city_id: "67", avg_online_hours: 6.4 }, { city_id: "12", avg_online_hours: 5.9 }, { city_id: "78", avg_online_hours: 5.1 }],
    explainabilityTrace: [
      "Метрика: avg_online_hours = AVG(online_time_sum_seconds)/3600",
      "Группировка: city_id",
      "Источник: driver_daily_metrics",
      "График: bar",
      "SQL validation: passed",
      "Confidence: 0.88"
    ]
  },
  {
    id: "drivee-demo-10-forecast-orders-7d",
    name: "Drivee Demo: прогноз заказов на 7 дней",
    description: "Демо-кейс прогноза: дневной ряд + baseline forecast.",
    question: "Спрогнозируй количество заказов на следующие 7 дней",
    role: "executive",
    target_role_key: "executive",
    expected_chart: "line",
    business_value: "Короткий прогноз для планирования ресурсов и KPI.",
    tags: ["drivee", "demo", "forecast", "orders"],
    reusable_scenario: false,
    notebookId: "strategy-board",
    sql: "SELECT DATE(order_timestamp) AS date, COUNT(DISTINCT order_id) AS orders_count FROM incity_orders WHERE order_timestamp >= CURRENT_DATE - INTERVAL '60 days' GROUP BY DATE(order_timestamp) ORDER BY date",
    runHref: r("/notebooks/strategy-board"),
    interpretedIntent: "forecast (orders_count, horizon=7d)",
    confidenceScore: 0.84,
    shortInsight: "Прогноз показывает умеренный рост, но требует проверки качества ряда.",
    tableResultPreview: [{ date: "2026-04-26", orders_count: 19320 }, { date: "2026-04-27", orders_count: 19510 }, { date: "2026-04-28", orders_count: 19740 }],
    explainabilityTrace: [
      "Метрика: заказы → COUNT(DISTINCT order_id)",
      "Историческое окно: последние 60 дней",
      "Forecast layer: horizon 7 days",
      "Источник: incity_orders",
      "График: line + forecast layer",
      "SQL validation: passed",
      "Confidence: 0.84"
    ]
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
    id: "nt-admin-health",
    name: "Платформенный health-check",
    description: "Статусы заказов и отмены за окно — для админ-обзора",
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
    id: "nt-mk-funnel",
    name: "Каналы и конверсия",
    description: "Сегменты order_channel и доля завершений",
    role: "marketer",
    href: r("/notebooks/campaign-q1")
  },
  {
    id: "nt-4",
    name: "Нарратив для совета",
    description: "KPI + прогноз + риски",
    role: "executive",
    href: r("/notebooks/strategy-board")
  },
  {
    id: "nt-exec-snapshot",
    name: "Сводка KPI за месяц",
    description: "Выручка, недельный тренд, топ городов",
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
