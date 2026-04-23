import type { AuthSessionDto, LoginRequestDto, RegisterRequestDto, TokenPairDto, UserDto } from "@/types/api/auth";
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
import type { NotebookScenarioDto, SavedReportListApiDto } from "@/types/api/reports";
import type { ScheduleDto } from "@/types/api/schedules";
import type { NotebookTemplateDto, QueryTemplateDto } from "@/types/api/templates";
import {
  comparativeDoneShareAlmatyAstana,
  dailyCancelledOrdersByDay,
  deterministicSqlComparativeDoneShare,
  deterministicSqlDailyCancellations,
  deterministicSqlTopCancelledCities,
  topCityCancellations,
  topCityLimitFromPrompt
} from "@/lib/demo/seeded-data";

function applyMockNotebookAnalyticsOptions(
  body: RunNotebookAnalyticsRequestDto,
  response: RunNotebookAnalyticsResponseDto
): RunNotebookAnalyticsResponseDto {
  const { force_fresh_dialogue, skip_learned_corrections, forecast_sidecar, chart_type_override, prompt } = body;
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
    trace.forecast_mode = { active: true, method: "linear_trend_ols" };
  } else if (forecast_sidecar === "off") {
    trace.forecast_mode = { active: false, method: null };
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
  tables_used: ["anonymized_incity_orders"],
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
  const user: UserDto = {
    id: "user-mock",
    email: _body.email,
    full_name: "Пользователь",
    role: "manager",
    workspace_id: "ws-1"
  };
  return { user, tokens };
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

export async function mockMe(): Promise<UserDto> {
  const wid = "00000000-0000-0000-0000-000000000001";
  return {
    id: "user-mock",
    email: "you@company.com",
    full_name: "Пользователь",
    role: "manager",
    workspace_id: wid,
    default_workspace_id: wid
  };
}

export async function mockListNotebooks(): Promise<NotebookListItemDto[]> {
  return [
    {
      id: "ops-health",
      title: "Main demo — top cancelled cities",
      created_at: "2026-04-18T10:00:00Z",
      updated_at: "2026-04-20T08:00:00Z",
      notebook_status: "active"
    },
    {
      id: "clarification-demo",
      title: "Clarification demo",
      created_at: "2026-04-10T12:00:00Z",
      updated_at: "2026-04-19T18:30:00Z",
      notebook_status: "active"
    },
    {
      id: "follow-up-demo",
      title: "Follow-up demo",
      created_at: "2026-04-09T09:00:00Z",
      updated_at: "2026-04-19T18:45:00Z",
      notebook_status: "active"
    }
  ];
}

export async function mockGetNotebook(id: string): Promise<NotebookDetailDto> {
  const list = await mockListNotebooks();
  const base = list.find((n) => n.id === id) ?? list[0];
  return { ...base, description: "Детали сценария", tags: ["scenario"] };
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
  const isReporting =
    (/операционн|ежедневн|регулярн|сводк|дашборд|отчётн/.test(normalizedPrompt) ||
      (/по дням/.test(normalizedPrompt) && /отмен/.test(normalizedPrompt))) &&
    !isComparative;
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
        "Controlled fallback: сравнение доли завершённых заказов (Алматы vs Астана), детерминированный демо-датасет."
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
      "Примечание: это демо-агрегат из SEEDED_ORDERS при недоступности live SQL."
    ].join("\n");
  } else if (isReporting) {
    const rows = dailyCancelledOrdersByDay();
    tablePayload = {
      columns: ["day", "cancellations"],
      rows,
      caption:
        "Controlled fallback: ежедневные отмены по демо-датасету (регулярная отчётность / операционный срез)."
    };
    chartPayload = {
      chartType: "line",
      recommendedChartType: "line",
      alternativeChartTypes: ["bar", "table"],
      visualizationExplanation: "Временной ряд отмен по дням для операционного мониторинга.",
      title: "Отмены по дням (демо-ряд)",
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
      `Пик отмен в окне демо-данных: ${peakDay ? `${peakDay.day} (${peakDay.cancellations})` : "—"}.`,
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
        options: [
          { id: "min_cancel", label: "Минимум отмен" },
          { id: "max_done", label: "Максимум завершенных" },
          { id: "max_revenue", label: "Максимальная выручка" }
        ]
      }
    : {
        prompt: "Уточните метрику отмен: учитывать все отмены или только клиентские?",
        options: [
          { id: "all", label: "Все отмены" },
          { id: "client", label: "Только клиентские отмены" },
          { id: "split", label: "Показать оба варианта" }
        ]
      };

  const sqlContent =
    isComparative ? deterministicSqlComparativeDoneShare() : isReporting ? deterministicSqlDailyCancellations() : deterministicSqlTopCancelledCities(topLimit);

  const rawResponse: RunNotebookAnalyticsResponseDto = {
    notebook_id: notebookId,
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
    trace: traceModel
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
      description: null,
      notebook_id: "nb-1",
      created_by: null,
      is_shared: false,
      created_at: now,
      updated_at: now,
      has_schedule: true
    }
  ];
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

export async function mockListSchedules(): Promise<ScheduleDto[]> {
  return [
    {
      id: "sch-1",
      name: "Еженедельный экспорт KPI",
      cron: "0 6 * * 1",
      timezone: "Europe/Moscow",
      target_type: "report",
      target_id: "r1",
      is_active: true,
      last_run_at: "2026-04-14T06:00:00Z",
      next_run_at: "2026-04-21T06:00:00Z"
    }
  ];
}

export async function mockListQueryTemplates(): Promise<QueryTemplateDto[]> {
  return [
    {
      id: "qt-1",
      name: "Дневной тренд заказов",
      description: "Заказы по дням",
      role: "marketer",
      sql: "SELECT date_trunc('day', order_timestamp)::date AS day, COUNT(DISTINCT order_id) AS orders_count FROM public.anonymized_incity_orders GROUP BY 1 ORDER BY 1",
      default_notebook_id: "nb-1"
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
      trace_summary: "Планировщик использовал anonymized_incity_orders",
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
      duration_ms: 890,
      chart_type: "bar",
      interpreted_summary: "comparison · city ranking",
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
      sql_expression: "COUNT(CASE WHEN a.driverdone_timestamp IS NOT NULL THEN 1 END)",
      visibility_roles: ["admin", "manager", "marketer", "executive"],
      domain: "orders_rides",
      canonical_metric_key: "done_rides",
      source_table: "anonymized_incity_orders",
      source_column: "driverdone_timestamp",
      aggregation_type: "case_count",
      constraints: { intents_allowed: ["summary", "trend", "ranking", "forecast"] },
      example_queries: ["Сколько поездок завершилось вчера по Алматы?"],
      system_interpretation_ru:
        "Каноническая метрика: done_rides. Домен: orders_rides. Источник: anonymized_incity_orders, колонка driverdone_timestamp."
    }
  ];
}

export async function mockUploadPreview(fileName: string): Promise<DataUploadPreviewDto> {
  return {
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
    source_table: body?.source_table ?? "public.anonymized_incity_orders",
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

export async function mockListCorrections(): Promise<CorrectionDto[]> {
  return [
    {
      id: "corr-1",
      notebook_id: "ops-health",
      summary: "Join по date grain создает дубли строк",
      proposed_fix: "Использовать dim_calendar.week_id вместо raw event_date в join",
      status: "pending",
      created_at: "2026-04-19T15:00:00Z"
    },
    {
      id: "corr-2",
      notebook_id: "campaign-q1",
      summary: "Несовпадение attribution window в запросе CAC",
      proposed_fix: "Выравнять окна spend и conversion на одинаковый 30-дневный период",
      status: "approved",
      created_at: "2026-04-18T11:20:00Z"
    }
  ];
}
