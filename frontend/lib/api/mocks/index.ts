import type { ReportPdfMode } from "@/lib/preferences/report-pdf";
import type {
  AuthSessionDto,
  LoginRequestDto,
  RegisterRequestDto,
  TokenPairDto,
  UserDto,
  UserProfileDto,
  UserProfilePatchDto
} from "@/types/api/auth";
import type {
  AnalyticsTraceDto,
  NotebookCellDto,
  RunNotebookAnalyticsRequestDto,
  RunNotebookAnalyticsResponseDto
} from "@/types/api/cells";
import { isExplainabilityTraceV1 } from "@/types/api/trace";
import type { CorrectionDto } from "@/types/api/corrections";
import type { DashboardSuggestionsResponseDto } from "@/types/api/dashboard";
import type { DataUploadJobDto, DataUploadPreviewDto } from "@/types/api/data-upload";
import type { DictionaryEntryDto } from "@/types/api/dictionary";
import type { AutoMLBacktestRequestDto, AutoMLBacktestResponseDto, ForecastRunResponseDto } from "@/types/api/forecast";
import type { NotebookRunDto, QueryHistoryDto } from "@/types/api/history";
import type { NotebookDetailDto, NotebookListItemDto } from "@/types/api/notebooks";
import type { NotebookScenarioDto, SavedReportDetailApiDto, SavedReportListApiDto } from "@/types/api/reports";
import type { NotebookTemplateDto, QueryTemplateDto } from "@/types/api/templates";
import type { TrainDatasetSummaryDto } from "@/types/api/train-dataset";
import {
  comparativeDoneShareAlmatyAstana,
  dailyCancelledOrdersByDay,
  dailyRevenueDoneByDay,
  demoChannelFunnelRows,
  deterministicSqlChannelConversion,
  deterministicSqlComparativeDoneShare,
  deterministicSqlDailyCancellations,
  deterministicSqlDailyRevenue,
  deterministicSqlGeoMapCities,
  deterministicSqlShareByCity,
  deterministicSqlTopCancelledCities,
  shareOrdersByCityForDonut,
  topCityCancellations,
  topCityLimitFromPrompt
} from "@/lib/demo/seeded-data";

function applyMockNotebookAnalyticsOptions(
  body: RunNotebookAnalyticsRequestDto,
  response: RunNotebookAnalyticsResponseDto
): RunNotebookAnalyticsResponseDto {
  const {
    force_fresh_dialogue,
    skip_learned_corrections,
    forecast_sidecar,
    chart_type_override,
    forecast_horizon_steps,
    prompt
  } = body;
  const looksLikeFollowUp = /\bа теперь\b|теперь только/i.test(prompt);

  if (!isExplainabilityTraceV1(response.trace)) {
    return response;
  }

  const trace = { ...response.trace };

  if (force_fresh_dialogue) {
    trace.follow_up_context_used = false;
  } else if (looksLikeFollowUp) {
    trace.follow_up_context_used = true;
  }

  if (skip_learned_corrections) {
    trace.learned_correction_used = false;
  }

  if (forecast_sidecar === "on") {
    trace.forecast_mode = { active: true, method: "baseline_linear_trend" };
  } else if (forecast_sidecar === "off") {
    trace.forecast_mode = { active: false, method: null };
  }

  if (typeof forecast_horizon_steps === "number" && forecast_horizon_steps >= 1 && forecast_horizon_steps <= 90) {
    const prev =
      trace.forecast_explainability && typeof trace.forecast_explainability === "object"
        ? (trace.forecast_explainability as Record<string, unknown>)
        : {};
    trace.forecast_explainability = { ...prev, horizon_steps: forecast_horizon_steps };
  }

  const ct = chart_type_override?.trim();
  if (ct && trace.chart_recommendation) {
    trace.chart_recommendation = {
      ...trace.chart_recommendation,
      chart_type: ct,
      rationale: `${trace.chart_recommendation.rationale || ""} (mock: тип=${ct})`.trim()
    };
  }

  const cells =
    ct && ct.length > 0
      ? response.cells.map((c) => {
          if (c.type !== "chart") return c;
          try {
            const p = JSON.parse(c.content) as Record<string, unknown>;
            return { ...c, content: JSON.stringify({ ...p, chartType: ct, recommendedChartType: ct }) };
          } catch {
            return c;
          }
        })
      : response.cells;

  return { ...response, trace, cells };
}

const trace: AnalyticsTraceDto = {
  schema_version: 1,
  interpreted_intent: "ranking · cancelled_orders_by_city",
  extracted_entities: { period: "current_week", metric: "cancelled_orders" },
  semantic_terms: [
    {
      term_key: "cancelled_orders",
      surface_form: "количество отменённых заказов",
      sql_fragment: "COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)",
      confidence: 0.95
    },
    {
      term_key: "current_week",
      surface_form: "на этой неделе",
      sql_fragment: "order_timestamp >= DATE_TRUNC('week', CURRENT_DATE)",
      confidence: 0.91
    }
  ],
  tables_used: ["train"],
  result_columns: ["city_id", "cancelled_orders", "avg_price_order_local"],
  generated_sql: deterministicSqlTopCancelledCities(),
  validation_status: "passed",
  warnings: [],
  confidence: 0.9,
  clarification_requested: false,
  follow_up_context_used: true,
  learned_correction_used: false,
  chart_recommendation: {
    chart_type: "bar",
    rationale: "Ranking городов по отменам лучше читается bar-графиком.",
    alternatives: ["horizontal_bar", "table"]
  },
  forecast_mode: { active: false, method: null },
  forecast_selection: {
    metric_key: null,
    selected_strategy: null,
    backtest_summary: {},
    data_quality: {}
  },
  forecast_explainability: {},
  quality_gate: {
    status: "passed",
    reasons: []
  },
  guardrails: { blocked: false, codes: [], messages_ru: [] },
  execution_phases: [
    { phase_id: "parsing", label: "Парсинг и интерпретация", status: "done", detail: "" },
    { phase_id: "generating_sql", label: "Генерация SQL", status: "done", detail: "" },
    { phase_id: "validating", label: "Проверка SQL", status: "done", detail: "" },
    { phase_id: "executing", label: "Выполнение запроса", status: "done", detail: "" },
    { phase_id: "visualizing", label: "Визуализация", status: "done", detail: "" },
    { phase_id: "done", label: "Инсайт и финализация", status: "done", detail: "" }
  ]
};

export async function mockLogin(_body: LoginRequestDto): Promise<AuthSessionDto> {
  const tokens: TokenPairDto = {
    access_token: "mock_access_token",
    refresh_token: "mock_refresh",
    token_type: "bearer",
    expires_in: 3600
  };
  const user = await mockMe();
  return { user: { ...user, email: _body.email }, tokens };
}

export async function mockRegister(body: RegisterRequestDto): Promise<AuthSessionDto> {
  const base = await mockLogin({ email: body.email, password: body.password });
  return {
    ...base,
    user: {
      ...base.user,
      full_name: body.full_name,
      role: body.demo_role ?? base.user.role
    }
  };
}

const mockProfileState: UserProfileDto = {
  first_name: "Пользователь",
  last_name: null,
  timezone: "Europe/Moscow",
  locale: "ru",
  default_report_pdf_mode: "board"
};

export async function mockPatchMyProfile(patch: UserProfilePatchDto): Promise<UserDto> {
  (Object.keys(patch) as (keyof UserProfilePatchDto)[]).forEach((key) => {
    const v = patch[key];
    if (v === undefined) return;
    if (key === "default_report_pdf_mode" && (v === "compact" || v === "board")) {
      mockProfileState.default_report_pdf_mode = v as ReportPdfMode;
      return;
    }
    if (key === "first_name" || key === "last_name") {
      mockProfileState[key] = v as string | null;
      return;
    }
    if (key === "timezone" && typeof v === "string") {
      mockProfileState.timezone = v;
      return;
    }
    if (key === "locale" && typeof v === "string") {
      mockProfileState.locale = v;
    }
  });
  return mockMe();
}

export async function mockMe(): Promise<UserDto> {
  const wid = "00000000-0000-0000-0000-000000000001";
  return {
    id: "user-mock",
    email: "you@company.com",
    full_name: "Пользователь",
    role: "manager",
    workspace_id: wid,
    default_workspace_id: wid,
    profile: { ...mockProfileState }
  };
}

export async function mockListNotebooks(): Promise<NotebookListItemDto[]> {
  return [
    {
      id: "ops-health",
      title: "Основной сценарий — топ городов по отменам",
      created_at: "2026-04-18T10:00:00Z",
      updated_at: "2026-04-20T08:00:00Z",
      notebook_status: "active"
    },
    {
      id: "clarification-demo",
      title: "Сценарий с уточнением",
      created_at: "2026-04-10T12:00:00Z",
      updated_at: "2026-04-19T18:30:00Z",
      notebook_status: "active"
    },
    {
      id: "follow-up-demo",
      title: "Сценарий с follow-up",
      created_at: "2026-04-09T09:00:00Z",
      updated_at: "2026-04-19T18:45:00Z",
      notebook_status: "active"
    }
  ];
}

export async function mockGetNotebook(id: string): Promise<NotebookDetailDto> {
  const list = await mockListNotebooks();
  const base = list.find((n) => n.id === id) ?? list[0];
  return {
    ...base,
    description: "Детали сценария",
    tags: ["scenario"],
    context_chain_json: {},
    cells: []
  };
}

export async function mockListCells(notebookId: string): Promise<NotebookCellDto[]> {
  // Return empty by default to avoid injecting stale demo prompts.
  return [];
}

export async function mockRunAnalytics(body: RunNotebookAnalyticsRequestDto): Promise<RunNotebookAnalyticsResponseDto> {
  const notebookId = body.notebook_id;
  const prompt = body.prompt;
  const normalizedPrompt = prompt.toLowerCase();
  const isComparative =
    /сравни/.test(normalizedPrompt) &&
    /алматы/.test(normalizedPrompt) &&
    /астан/.test(normalizedPrompt);
  const isRevenueTrend =
    /выручк|revenue|оборот|gmv/.test(normalizedPrompt) &&
    /по дням|динамик|7\s*дн|недел|дней|week|day/i.test(normalizedPrompt);
  const isChannelConversion =
    /канал|order_channel|channel/.test(normalizedPrompt) &&
    /конверс|заверш|completed|28/.test(normalizedPrompt);
  const isShareByCity =
    /структур|дол|долю|распредел/.test(normalizedPrompt) && /город|city_id/.test(normalizedPrompt);
  const isGeoMapDemo = /карт|на карте|географ|map/.test(normalizedPrompt) && /город/.test(normalizedPrompt);
  const isReporting =
    (/операционн|ежедневн|регулярн|сводк|дашборд|отчётн/.test(normalizedPrompt) ||
      (/по дням/.test(normalizedPrompt) && /отмен/.test(normalizedPrompt))) &&
    !isComparative &&
    !isRevenueTrend;
  const isCollaboration =
    /шаблон|каталог шаблон|weekly_cancellations|из библиотек/.test(normalizedPrompt);

  const topLimit = topCityLimitFromPrompt(prompt, 3);
  const topLabel = `топ-${topLimit}`;
  const rankRows = topCityCancellations(topLimit);

  type TablePayload = {
    columns: string[];
    rows: Record<string, string | number>[];
    caption: string;
  };
  let tablePayload: TablePayload;
  let chartPayload: Record<string, unknown>;
  let traceModel: AnalyticsTraceDto;
  let traceText: string;
  let insightBody: string;

  if (isComparative) {
    const rows = comparativeDoneShareAlmatyAstana();
    tablePayload = {
      columns: ["city_id", "done_orders", "total_orders", "done_share"],
      rows,
      caption:
        "Controlled fallback: сравнение доли завершённых заказов (Алматы vs Астана), детерминированный тестовый датасет."
    };
    chartPayload = {
      chartType: "bar",
      recommendedChartType: "bar",
      alternativeChartTypes: ["table"],
      visualizationExplanation: "Сравнение двух городов по доле завершённых заказов.",
      title: "Доля завершённых: Алматы vs Астана",
      xKey: "city_id",
      series: [{ key: "done_share", name: "Доля завершённых" }],
      data: rows
    };
    traceModel = {
      ...trace,
      interpreted_intent: "comparison · done_share(almaty_vs_astana)",
      extracted_entities: { cities: ["Алматы", "Астана"], window_days: 14 },
      generated_sql: deterministicSqlComparativeDoneShare(),
      chart_recommendation: {
        chart_type: "bar",
        rationale: "Две точки сравнения — bar проще читать, чем line.",
        alternatives: ["table"]
      }
    };
    traceText = "Намерение: сравнение городов · метрика: share(completed) · окно: 14 дней";
    const [a, b] = rows;
    insightBody = [
      `Инсайт по запросу: «${prompt}».`,
      `Алматы: доля завершённых ${a?.done_share ?? "—"} при ${a?.total_orders ?? 0} заказах в выборке.`,
      `Астана: доля завершённых ${b?.done_share ?? "—"} при ${b?.total_orders ?? 0} заказах в выборке.`,
      "Примечание: это агрегат из SEEDED_ORDERS при недоступности live SQL."
    ].join("\n");
  } else if (isChannelConversion) {
    const rows = demoChannelFunnelRows();
    tablePayload = {
      columns: ["order_channel", "orders", "completed", "conversion"],
      rows,
      caption: "Controlled fallback: конверсия в завершённую поездку по каналам (фиксированный срез)."
    };
    chartPayload = {
      chartType: "bar",
      recommendedChartType: "bar",
      alternativeChartTypes: ["horizontal_bar", "table"],
      visualizationExplanation: "Сравнение категорий (каналы) — столбчатая диаграмма.",
      title: "Конверсия по каналам",
      xKey: "order_channel",
      series: [{ key: "conversion", name: "Конверсия" }],
      data: rows
    };
    traceModel = {
      ...trace,
      interpreted_intent: "comparison · channel_conversion",
      extracted_entities: { window_days: 28 },
      generated_sql: deterministicSqlChannelConversion(),
      chart_recommendation: {
        chart_type: "bar",
        rationale: "Каналы — bar chart.",
        alternatives: ["table"]
      }
    };
    traceText = "Намерение: сравнение каналов · метрика: conversion · окно: 28 дней";
    insightBody = [
      `Инсайт по запросу: «${prompt}».`,
      `Лучший канал по конверсии в текущем срезе: ${rows.reduce((best, r) => (r.conversion > best.conversion ? r : best), rows[0])?.order_channel ?? "—"}.`,
      "В live режиме SQL читает реальные order_channel из warehouse."
    ].join("\n");
  } else if (isRevenueTrend) {
    const rows = dailyRevenueDoneByDay();
    tablePayload = {
      columns: ["day", "revenue"],
      rows,
      caption: "Controlled fallback: выручка (сумма price) по завершённым заказам по дням из SEEDED_ORDERS."
    };
    chartPayload = {
      chartType: "line",
      recommendedChartType: "line",
      alternativeChartTypes: ["area", "bar", "table"],
      visualizationExplanation: "Динамика выручки во времени — линейный график.",
      title: "Выручка по дням",
      xKey: "day",
      series: [{ key: "revenue", name: "Выручка" }],
      data: rows
    };
    traceModel = {
      ...trace,
      interpreted_intent: "trend · revenue_by_day",
      extracted_entities: { period: "7d_demo" },
      generated_sql: deterministicSqlDailyRevenue(),
      chart_recommendation: {
        chart_type: "line",
        rationale: "Динамика → line.",
        alternatives: ["table"]
      }
    };
    traceText = "Намерение: тренд выручки · гранулярность: day";
    insightBody = [
      `Инсайт по запросу: «${prompt}».`,
      rows.length ? `Суммарная выручка в окне: ${rows.reduce((s, r) => s + r.revenue, 0).toLocaleString("ru-RU")} (усл. ед.).` : "Нет завершённых строк в текущем окне.",
      "Примечание: агрегат из тестовых заказов при fallback."
    ].join("\n");
  } else if (isShareByCity) {
    const rows = shareOrdersByCityForDonut();
    tablePayload = {
      columns: ["city_id", "orders", "share"],
      rows,
      caption: "Controlled fallback: структура заказов по городам (доля в выборке SEEDED_ORDERS)."
    };
    chartPayload = {
      chartType: "donut",
      recommendedChartType: "donut",
      alternativeChartTypes: ["pie", "bar", "table"],
      visualizationExplanation: "Структура долей — donut chart.",
      title: "Доля заказов по городам",
      xKey: "city_id",
      series: [{ key: "orders", name: "Заказы" }],
      data: rows.map((r) => ({ city_id: r.city_id, orders: r.orders }))
    };
    traceModel = {
      ...trace,
      interpreted_intent: "share · orders_by_city",
      generated_sql: deterministicSqlShareByCity(),
      chart_recommendation: {
        chart_type: "donut",
        rationale: "Доли категорий — donut / pie.",
        alternatives: ["table"]
      }
    };
    traceText = "Намерение: структура / доли · измерение: city_id";
    insightBody = [
      `Инсайт по запросу: «${prompt}».`,
      `Крупнейший вклад: ${rows[0]?.city_id ?? "—"} (${Math.round((rows[0]?.share ?? 0) * 100)}% заказов в выборке).`,
      "В live режиме доли пересчитываются по полной таблице."
    ].join("\n");
  } else if (isGeoMapDemo) {
    const rows = topCityCancellations(8);
    const mapFeatures = rows.map((r) => ({
      id: String(r.city_id),
      label: String(r.city_id),
      value: r.cancelled_orders,
      lat: null,
      lon: null
    }));
    tablePayload = {
      columns: ["city_id", "cancelled_orders", "avg_price_order_local", "avg_duration_in_seconds", "avg_distance_in_meters"],
      rows,
      caption: "Controlled fallback: гео-запрос — map-ready структура + рейтинг отмен по городам."
    };
    chartPayload = {
      chartType: "map",
      recommendedChartType: "map",
      alternativeChartTypes: ["geo_bubble", "horizontal_bar", "table"],
      visualizationExplanation: "География по городам — карта (MVP) с mapFeatures для будущего слоя.",
      geoMetadata: {
        geoEnabled: true,
        geoDimension: "city_id",
        mapScope: "auto",
        fallbackChartType: "horizontal_bar",
        mapFeatures
      },
      title: "Города на карте",
      xKey: "city_id",
      series: [{ key: "cancelled_orders", name: "Отмены" }],
      data: rows
    };
    traceModel = {
      ...trace,
      interpreted_intent: "geo · city_cancellations_map",
      generated_sql: deterministicSqlGeoMapCities(),
      chart_recommendation: {
        chart_type: "map",
        rationale: "Гео-запрос — карта с fallback на рейтинг.",
        alternatives: ["horizontal_bar", "table"]
      }
    };
    traceText = "Намерение: география · метрика: cancellations · карта (MVP)";
    insightBody = [
      `Инсайт по запросу: «${prompt}».`,
      `Топ по отменам в текущем срезе: ${rows[0]?.city_id ?? "—"}.`,
      "Интерактивная карта в продукте — следующий этап; сейчас geo card + те же данные."
    ].join("\n");
  } else if (isReporting) {
    const rows = dailyCancelledOrdersByDay();
    tablePayload = {
      columns: ["day", "cancellations"],
      rows,
      caption:
        "Controlled fallback: ежедневные отмены по тестовому датасету (регулярная отчётность / операционный срез)."
    };
    chartPayload = {
      chartType: "line",
      recommendedChartType: "line",
      alternativeChartTypes: ["bar", "table"],
      visualizationExplanation: "Временной ряд отмен по дням для операционного мониторинга.",
      title: "Отмены по дням",
      xKey: "day",
      series: [{ key: "cancellations", name: "Отмены" }],
      data: rows
    };
    traceModel = {
      ...trace,
      interpreted_intent: "timeseries · daily_cancellations",
      extracted_entities: { period: "seeded_demo_window" },
      generated_sql: deterministicSqlDailyCancellations(),
      chart_recommendation: {
        chart_type: "line",
        rationale: "Динамика по дням — line.",
        alternatives: ["bar", "table"]
      }
    };
    traceText = "Намерение: операционная сводка · метрика: cancellations · гранулярность: day";
    const peakDay =
      rows.length > 0 ? rows.reduce((best, r) => (r.cancellations > best.cancellations ? r : best), rows[0]) : null;
    insightBody = [
      `Инсайт по запросу: «${prompt}».`,
      `Пик отмен в текущем окне данных: ${peakDay ? `${peakDay.day} (${peakDay.cancellations})` : "—"}.`,
      "Рекомендация: в live-режиме привязать окно к календарю SLA и исключить тестовые заказы."
    ].join("\n");
  } else {
    tablePayload = {
      columns: [
        "city_id",
        "cancelled_orders",
        "avg_price_order_local",
        "avg_duration_in_seconds",
        "avg_distance_in_meters"
      ],
      rows: rankRows,
      caption: isCollaboration
        ? "Controlled fallback: тот же ranking-запрос, помечен как запуск из шаблона weekly_cancellations_by_city."
        : `Mock dataset: ${topLabel} города по отменам (текущая неделя)`
    };
    chartPayload = {
      chartType: "bar",
      recommendedChartType: "bar",
      alternativeChartTypes: ["horizontal_bar", "table"],
      visualizationExplanation: "Bar chart стабильно отображает ranking городов по отменам.",
      title: `${topLabel[0]?.toUpperCase() ?? "Т"}${topLabel.slice(1)} города по отменённым заказам`,
      xKey: "city_id",
      series: [{ key: "cancelled_orders", name: "Отмены" }],
      data: tablePayload.rows
    };
    traceModel = {
      ...trace,
      interpreted_intent: isCollaboration
        ? `template · weekly_cancellations_by_city · ranking(top_${topLimit})`
        : `ranking · cancelled_orders_by_city(top_${topLimit})`,
      extracted_entities: isCollaboration
        ? {
            ...(isExplainabilityTraceV1(trace) ? trace.extracted_entities : {}),
            template_key: "weekly_cancellations_by_city"
          }
        : isExplainabilityTraceV1(trace)
          ? trace.extracted_entities
          : {},
      generated_sql: deterministicSqlTopCancelledCities(topLimit)
    };
    traceText = isCollaboration
      ? "Намерение: шаблон команды → ranking отмен по городам · период: текущая неделя"
      : "Намерение: ranking отмен по городам · метрика: cancelled_orders · период: текущая неделя";
    insightBody = [
      `Инсайт по запросу: «${prompt}».`,
      `Лидер по отменам: ${rankRows[0]?.city_id ?? "—"} (${rankRows[0]?.cancelled_orders ?? 0}).`,
      isCollaboration
        ? "Совместная работа: один и тот же NL/SQL-шаблон в workspace даёт сопоставимые запуски между ролями."
        : "Рекомендуемый guardrail: алерт при росте отмен > 10% WoW."
    ].join("\n");
  }

  const isAmbiguous = normalizedPrompt.includes("лучшие города");
  const clarificationPayload = isAmbiguous
    ? {
        prompt: "Уточните, что значит «лучшие»: по количеству отмен, по завершенным заказам или по выручке?",
        reason_code: "best_metric_unspecified",
        reason_summary_ru:
          "Не выбрана метрика для понятия «лучшие» или для рейтинга — укажите критерий в вариантах ниже.",
        options: [
          { id: "min_cancel", label: "Минимум отмен" },
          { id: "max_done", label: "Максимум завершенных" },
          { id: "max_revenue", label: "Максимальная выручка" }
        ]
      }
    : {
        prompt: "Уточните метрику отмен: учитывать все отмены или только клиентские?",
        reason_code: "ranking_metric_unspecified",
        reason_summary_ru: "Не указана метрика, по которой ранжировать или фильтровать отмены.",
        options: [
          { id: "all", label: "Все отмены" },
          { id: "client", label: "Только клиентские отмены" },
          { id: "split", label: "Показать оба варианта" }
        ]
      };

  const traceFinal: AnalyticsTraceDto = isExplainabilityTraceV1(traceModel)
    ? {
        ...traceModel,
        clarification_requested: isAmbiguous,
        clarification_reason: isAmbiguous ? String((clarificationPayload as { reason_code?: string }).reason_code ?? "") : "",
        clarification_reason_summary_ru: isAmbiguous
          ? String((clarificationPayload as { reason_summary_ru?: string }).reason_summary_ru ?? "")
          : "",
        clarification_question: isAmbiguous ? String(clarificationPayload.prompt ?? "") : ""
      }
    : traceModel;

  const sqlContent = isComparative
    ? deterministicSqlComparativeDoneShare()
    : isChannelConversion
      ? deterministicSqlChannelConversion()
      : isRevenueTrend
        ? deterministicSqlDailyRevenue()
        : isShareByCity
          ? deterministicSqlShareByCity()
          : isGeoMapDemo
            ? deterministicSqlGeoMapCities()
            : isReporting
              ? deterministicSqlDailyCancellations()
              : deterministicSqlTopCancelledCities(topLimit);

  const rawResponse: RunNotebookAnalyticsResponseDto = {
    notebook_id: notebookId,
    resolved_source_table: "public.train",
    cells: [
      {
        id: `${notebookId}-p1`,
        notebook_id: notebookId,
        type: "prompt",
        content: prompt,
        position: 0
      },
      {
        id: `${notebookId}-cl1`,
        notebook_id: notebookId,
        type: "clarification",
        content: JSON.stringify(clarificationPayload),
        position: 1
      },
      {
        id: `${notebookId}-tr1`,
        notebook_id: notebookId,
        type: "trace",
        content: traceText,
        position: 2
      },
      {
        id: `${notebookId}-sql1`,
        notebook_id: notebookId,
        type: "sql",
        content: sqlContent,
        position: 3
      },
      {
        id: `${notebookId}-tb1`,
        notebook_id: notebookId,
        type: "table",
        content: JSON.stringify(tablePayload),
        position: 4
      },
      {
        id: `${notebookId}-ch1`,
        notebook_id: notebookId,
        type: "chart",
        content: JSON.stringify(chartPayload),
        position: 5
      },
      {
        id: `${notebookId}-in1`,
        notebook_id: notebookId,
        type: "insight",
        content: insightBody,
        position: 6
      }
    ],
    trace: traceFinal
  };

  return applyMockNotebookAnalyticsOptions(body, rawResponse);
}

export async function mockListReports(): Promise<SavedReportListApiDto[]> {
  const now = "2026-04-20T06:00:00Z";
  return [
    {
      id: "r1",
      workspace_id: "00000000-0000-0000-0000-000000000001",
      title: "Еженедельный KPI-пак",
      description: "Демо: снимок train + график",
      notebook_id: "nb-1",
      created_by: null,
      creator_role_key: "manager",
      is_shared: false,
      created_at: now,
      updated_at: now,
      has_schedule: true,
      report_format: "pdf"
    }
  ];
}

export async function mockGetSavedReportDetail(reportId: string): Promise<SavedReportDetailApiDto> {
  const list = await mockListReports();
  const base = list[0]!;
  return {
    ...base,
    id: reportId,
    report_payload_json: {
      prompt: "Покажи топ городов по отменам за 7 дней",
      interpreted_query: "ranking · city_id · cancellations",
      generated_sql:
        "SELECT city_id, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL)::bigint AS c FROM public.train WHERE order_timestamp >= CURRENT_DATE - INTERVAL '7 day' GROUP BY 1 ORDER BY 2 DESC LIMIT 10",
      chart_type: "bar",
      chart_config: { chartType: "bar", xKey: "city_id", note: "mock" },
      result_snapshot: {
        columns: ["city_id", "c"],
        rows: [
          { city_id: "101", c: 12 },
          { city_id: "205", c: 9 }
        ],
        row_count: 2
      },
      result_metadata: { validation_status: "passed" },
      confidence: 0.86,
      creator_role_key: "manager",
      creator_user_id: "mock-user",
      trace_summary: "Intent=ranking · status=succeeded",
      warnings: [],
      captured_at: base.created_at,
      saved_at: base.updated_at
    },
    schedule: {
      id: "sch-mock-1",
      report_id: reportId,
      cron_expression: "0 9 * * 1",
      timezone: "UTC",
      is_active: true,
      delivery_channel: "email_mock",
      delivery_config_json: {
        frequency: "weekly",
        hour_utc: 9,
        mock_delivery_log: [{ event: "schedule_created", at: base.created_at, channel: "email_mock" }]
      },
      last_run_at: null,
      next_run_at: "2026-04-28T09:00:00Z",
      created_at: base.created_at,
      updated_at: base.updated_at,
      frequency: "weekly",
      hour_utc: 9,
      minute_utc: 0
    }
  };
}

export async function mockListScenarios(): Promise<NotebookScenarioDto[]> {
  return [
    {
      id: "s1",
      name: "Main demo: weekly cancellations",
      notebook_id: "ops-health",
      owner_email: "ops@acme.co",
      updated_at: "2026-04-19T23:00:00Z",
      schedule: "active"
    },
    {
      id: "s2",
      name: "Clarification scenario",
      notebook_id: "clarification-demo",
      owner_email: "analytics@acme.co",
      updated_at: "2026-04-19T22:15:00Z",
      schedule: "paused"
    }
  ];
}

export async function mockListQueryTemplates(): Promise<QueryTemplateDto[]> {
  return [
    {
      id: "qt-mock-revenue-city",
      name: "Выручка по городам (30 дней)",
      description: "Сумма price_order_local по city_id",
      role: "executive",
      sql: "SELECT city_id, SUM(price_order_local)::numeric(18,2) AS revenue_local FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC",
      default_notebook_id: "strategy-board",
      template_key: "revenue_by_city_last_month",
      nl_prompt_template: "Покажи выручку по городам за последний месяц",
      sql_template:
        "SELECT city_id, SUM(price_order_local)::numeric(18,2) AS revenue_local FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC",
      default_chart_type: "bar",
      target_role_key: "executive"
    },
    {
      id: "qt-mock-orders-channel",
      name: "Заказы по каналам",
      description: "Сравнение объёма по order_channel",
      role: "marketer",
      sql: "SELECT order_channel, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '28 day') GROUP BY 1 ORDER BY 2 DESC",
      default_notebook_id: "campaign-q1",
      template_key: "orders_count_by_channel",
      nl_prompt_template: "Сравни количество заказов по каналам",
      sql_template:
        "SELECT order_channel, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '28 day') GROUP BY 1 ORDER BY 2 DESC",
      default_chart_type: "bar",
      target_role_key: "marketer"
    },
    {
      id: "qt-mock-cancel-daily",
      name: "Динамика отмен по дням",
      description: "За 30 дней",
      role: "manager",
      sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 1",
      default_notebook_id: "ops-health",
      template_key: "cancellations_by_period",
      nl_prompt_template: "Покажи динамику отмен по дням",
      sql_template:
        "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL)::bigint AS cancellations FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 1",
      default_chart_type: "line",
      target_role_key: null
    },
    {
      id: "qt-mock-top5",
      name: "Топ-5 городов по выручке",
      description: "SUM + LIMIT 5",
      role: "executive",
      sql: "SELECT city_id, SUM(price_order_local)::numeric(18,2) AS revenue_local FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC LIMIT 5",
      default_notebook_id: "strategy-board",
      template_key: "top5_cities_by_revenue",
      nl_prompt_template: "Покажи топ-5 городов по выручке",
      sql_template:
        "SELECT city_id, SUM(price_order_local)::numeric(18,2) AS revenue_local FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC LIMIT 5",
      default_chart_type: "bar",
      target_role_key: "executive"
    },
    {
      id: "qt-mock-wow",
      name: "Заказы: неделя к неделе",
      description: "Две колонки — прошлая и текущая неделя",
      role: "manager",
      sql: "SELECT COUNT(*) FILTER (WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '7 day' AND order_timestamp < date_trunc('week', CURRENT_DATE))::bigint AS orders_prev_week, COUNT(*) FILTER (WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) AND order_timestamp < date_trunc('week', CURRENT_DATE) + interval '7 day')::bigint AS orders_this_week FROM public.train WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '14 day'",
      default_notebook_id: "ops-health",
      template_key: "orders_week_over_week",
      nl_prompt_template: "Сравни недели между собой по числу заказов",
      sql_template:
        "SELECT COUNT(*) FILTER (WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '7 day' AND order_timestamp < date_trunc('week', CURRENT_DATE))::bigint AS orders_prev_week, COUNT(*) FILTER (WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) AND order_timestamp < date_trunc('week', CURRENT_DATE) + interval '7 day')::bigint AS orders_this_week FROM public.train WHERE order_timestamp >= date_trunc('week', CURRENT_DATE) - interval '14 day'",
      default_chart_type: "bar",
      target_role_key: "manager"
    },
    {
      id: "qt-mock-avg-channel",
      name: "Средний чек по каналам",
      description: "Сегмент = order_channel",
      role: "marketer",
      sql: "SELECT order_channel, AVG(price_order_local)::numeric(18,2) AS avg_check FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC",
      default_notebook_id: "campaign-q1",
      template_key: "avg_check_by_order_channel",
      nl_prompt_template: "Покажи средний чек по категориям",
      sql_template:
        "SELECT order_channel, AVG(price_order_local)::numeric(18,2) AS avg_check FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 2 DESC",
      default_chart_type: "bar",
      target_role_key: "marketer"
    },
    {
      id: "qt-mock-cancel-share",
      name: "Доля отмен по городам",
      description: "За 14 дней",
      role: "manager",
      sql: "SELECT city_id, (COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id),0) AS cancellation_rate FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '14 day') GROUP BY 1 ORDER BY 2 DESC",
      default_notebook_id: "ops-health",
      template_key: "cancel_rate_by_city",
      nl_prompt_template: "Покажи долю отмен по городам",
      sql_template:
        "SELECT city_id, (COUNT(*) FILTER (WHERE clientcancel_timestamp IS NOT NULL OR drivercancel_timestamp IS NOT NULL))::numeric / NULLIF(COUNT(DISTINCT order_id),0) AS cancellation_rate FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '14 day') GROUP BY 1 ORDER BY 2 DESC",
      default_chart_type: "bar",
      target_role_key: null
    },
    {
      id: "qt-mock-trend-30",
      name: "Тренд заказов за 30 дней",
      description: "По дням",
      role: "marketer",
      sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 1",
      default_notebook_id: "campaign-q1",
      template_key: "orders_trend_30d",
      nl_prompt_template: "Покажи тренд заказов за 30 дней",
      sql_template:
        "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id)::bigint AS orders_count FROM public.train WHERE order_timestamp >= (CURRENT_DATE - INTERVAL '30 day') GROUP BY 1 ORDER BY 1",
      default_chart_type: "line",
      target_role_key: null
    }
  ];
}

export async function mockListNotebookTemplates(): Promise<NotebookTemplateDto[]> {
  return [
    {
      id: "nt-1",
      name: "Стартовый governance-шаблон",
      description: "Словарь + проверки",
      role: "admin",
      notebook_id: "nb-1"
    }
  ];
}

export async function mockListNotebookRuns(): Promise<NotebookRunDto[]> {
  return [
    {
      id: "run-1",
      ran_at: "2026-04-20T10:12:00Z",
      notebook_id: "ops-health",
      notebook_title: "Main demo — top cancelled cities",
      status: "success",
      validation_ok: true,
      validation_hint: "ОК",
      trace_summary: "Планировщик использовал train",
      duration_ms: 4200
    }
  ];
}

export async function mockListQueryHistory(): Promise<QueryHistoryDto[]> {
  return [
    {
      id: "q-1",
      ran_at: "2026-04-20T08:02:00Z",
      label: "Top-3 cancelled cities this week",
      sql_preview: "SELECT city_id, COUNT(*) AS cancelled_orders ...",
      notebook_id: "ops-health",
      validation_ok: true,
      validation_hint: "passed",
      execution_status: "succeeded",
      duration_ms: 890,
      chart_type: "bar",
      interpreted_summary: "comparison · city ranking",
      parsed_intent_json: { intent: "ranking", metric: "cancellations" },
      confidence: 0.84,
      result_summary: "Лидеры по отменам сосредоточены в нескольких city_id.",
      author_role_key: "manager",
      owner_user_id: "user-mock",
      rerun_cell_id: "q-1",
      rerun_notebook_id: "ops-health",
      save_as_report_body_hint: {
        workspace_id: "00000000-0000-0000-0000-000000000001",
        title: "Top-3 cancelled cities this week",
        source_cell_id: "q-1",
        notebook_id: "ops-health"
      }
    }
  ];
}

export async function mockListDictionary(): Promise<DictionaryEntryDto[]> {
  return [
    {
      id: "done_rides",
      term: "Завершённые поездки",
      synonyms: ["завершённые поездки", "completed rides", "выполненные заказы"],
      sql_expression:
        "COUNT(DISTINCT CASE WHEN a.driverdone_timestamp IS NOT NULL THEN a.order_id END)",
      visibility_roles: ["admin", "manager", "marketer", "executive"],
      domain: "orders_rides",
      canonical_metric_key: "done_rides",
      source_table: "train",
      source_column: "driverdone_timestamp",
      aggregation_type: "case_count",
      constraints: { intents_allowed: ["summary", "trend", "ranking", "forecast"] },
      example_queries: ["Сколько поездок завершилось вчера по Алматы?"],
      system_interpretation_ru:
        "Каноническая метрика: done_rides. Домен: orders_rides. Источник: train, колонка driverdone_timestamp."
    }
  ];
}

export async function mockUploadPreview(fileName: string): Promise<DataUploadPreviewDto> {
  return {
    upload_id: `up-${Date.now()}`,
    file_name: fileName,
    inferred_schema: [
      { name: "id", type: "STRING", nullable: false },
      { name: "amount", type: "DECIMAL", nullable: true }
    ],
    sample_rows: [{ id: "1", amount: "10.5" }],
    warnings: ["Mock preview — без антивирусной проверки"]
  };
}

export async function mockCreateUploadJob(): Promise<DataUploadJobDto> {
  return {
    id: `job-${Date.now()}`,
    status: "completed",
    file_name: "upload.csv",
    table_name: "staging.upload_mock",
    created_at: new Date().toISOString()
  };
}

export async function mockForecastRun(): Promise<ForecastRunResponseDto> {
  return {
    notebook_id: "nb-1",
    scenarios: [
      {
        id: "fc-1",
        name: "Базовый сценарий",
        horizon_label: "8w",
        baseline: 52_000,
        optimistic: 54_500,
        pessimistic: 49_800,
        unit: "orders"
      }
    ],
    narrative: "Mock-описание прогноза."
  };
}

export async function mockForecastAutoMLBacktest(
  body?: Partial<AutoMLBacktestRequestDto>
): Promise<AutoMLBacktestResponseDto> {
  const horizon = Math.max(1, Math.min(90, Number(body?.horizon_days ?? 14)));
  const holdout = Math.max(3, Math.min(120, Number(body?.holdout_days ?? 14)));
  const strategies = body?.strategies?.length
    ? body.strategies
    : ["linear_regression", "trend_extrapolation", "rolling_average"];

  return {
    workspace_id: body?.workspace_id ?? "00000000-0000-0000-0000-000000000001",
    upload_id: body?.upload_id ?? null,
    source_table: body?.source_table ?? "public.train",
    date_column: body?.date_column ?? "order_timestamp",
    horizon_days: horizon,
    holdout_days: holdout,
    strategy_candidates: strategies,
    metrics_snapshot: {
      orders_count: 12480,
      done_rides: 11240,
      cancellation_rate: 0.098
    },
    leaderboards: [
      {
        metric_key: "orders_count",
        best_strategy: "linear_regression",
        best_score: 9.72,
        models: [
          {
            strategy_key: "linear_regression",
            status: "ok",
            mae: 8.91,
            rmse: 10.3,
            mape: 7.2,
            score: 9.72,
            backtest_points: holdout,
            backtest_preview: Array.from({ length: holdout }).map((_, i) => ({
              date: new Date(Date.now() - (holdout - i) * 86400000).toISOString().slice(0, 10),
              actual: Number((124 + i * 1.6).toFixed(2)),
              predicted: Number((123 + i * 1.7).toFixed(2))
            }))
          },
          {
            strategy_key: "trend_extrapolation",
            status: "ok",
            mae: 10.14,
            rmse: 12.02,
            mape: 8.5,
            score: 11.19,
            backtest_points: holdout,
            backtest_preview: []
          },
          {
            strategy_key: "rolling_average",
            status: "ok",
            mae: 12.44,
            rmse: 14.21,
            mape: 9.8,
            score: 13.32,
            backtest_points: holdout,
            backtest_preview: []
          }
        ],
        forecast_preview: Array.from({ length: horizon }).map((_, i) => ({
          step: i + 1,
          date: new Date(Date.now() + (i + 1) * 86400000).toISOString().slice(0, 10),
          value: Number((128 + i * 1.8).toFixed(2))
        }))
      },
      {
        metric_key: "done_rides",
        best_strategy: "trend_extrapolation",
        best_score: 8.41,
        models: [
          { strategy_key: "trend_extrapolation", status: "ok", mae: 7.5, rmse: 9.1, mape: 6.3, score: 8.41, backtest_points: holdout, backtest_preview: [] },
          { strategy_key: "linear_regression", status: "ok", mae: 8.33, rmse: 9.8, mape: 6.7, score: 9.02, backtest_points: holdout, backtest_preview: [] },
          { strategy_key: "rolling_average", status: "ok", mae: 11.1, rmse: 13.4, mape: 9.2, score: 12.03, backtest_points: holdout, backtest_preview: [] }
        ],
        forecast_preview: Array.from({ length: horizon }).map((_, i) => ({
          step: i + 1,
          date: new Date(Date.now() + (i + 1) * 86400000).toISOString().slice(0, 10),
          value: Number((116 + i * 1.35).toFixed(2))
        }))
      }
    ]
  };
}

export async function mockDashboardSuggestions(): Promise<DashboardSuggestionsResponseDto> {
  return {
    suggestions: [
      {
        id: "sg-1",
        title: "Проверить исправления в ожидании",
        description: "2 предложенных SQL-исправления требуют подтверждения администратора.",
        href: "/dashboard/admin",
        role: "admin",
        kind: "notebook"
      },
      {
        id: "sg-2",
        title: "Еженедельные операционные исключения",
        description: "Отчет по исключениям и SLA нужно обновить до стендапа.",
        href: "/notebooks/ops-health",
        role: "manager",
        kind: "notebook"
      },
      {
        id: "sg-3",
        title: "Прогнозный пакет для совета",
        description: "Откройте руководительский отчет с прогнозными коридорами и рисками.",
        href: "/reports",
        role: "executive",
        kind: "report"
      }
    ]
  };
}

export async function mockTrainDatasetSummary(): Promise<TrainDatasetSummaryDto> {
  return {
    source_table: "public.train",
    train_row_count: 12_480,
    distinct_orders: 8_420,
    done_rides: 9_100,
    cancellations_total: 1_740,
    order_timestamp_min: "2026-04-01T00:00:00.000Z",
    order_timestamp_max: "2026-04-23T00:00:00.000Z",
    sum_order_price: 3_450_000
  };
}

export async function mockListCorrections(): Promise<CorrectionDto[]> {
  return [
    {
      id: "corr-1",
      notebook_id: "ops-health",
      summary: "Join по date grain создает дубли строк",
      proposed_fix: "Использовать dim_calendar.week_id вместо raw event_date в join",
      status: "pending",
      lifecycle: "mock",
      created_at: "2026-04-19T15:00:00Z"
    },
    {
      id: "corr-2",
      notebook_id: "campaign-q1",
      summary: "Несовпадение attribution window в запросе CAC",
      proposed_fix: "Выравнять окна spend и conversion на одинаковый 30-дневный период",
      status: "approved",
      lifecycle: "mock",
      created_at: "2026-04-18T11:20:00Z"
    }
  ];
}
