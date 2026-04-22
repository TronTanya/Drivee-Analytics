import type { AuthSessionDto, LoginRequestDto, RegisterRequestDto, TokenPairDto, UserDto } from "@/types/api/auth";
import type {
  AnalyticsTraceDto,
  NotebookCellDto,
  RunNotebookAnalyticsResponseDto
} from "@/types/api/cells";
import type { CorrectionDto } from "@/types/api/corrections";
import type { DashboardSuggestionsResponseDto } from "@/types/api/dashboard";
import type { DataUploadJobDto, DataUploadPreviewDto } from "@/types/api/data-upload";
import type { DictionaryEntryDto } from "@/types/api/dictionary";
import type { AutoMLBacktestRequestDto, AutoMLBacktestResponseDto, ForecastRunResponseDto } from "@/types/api/forecast";
import type { NotebookRunDto, QueryHistoryDto } from "@/types/api/history";
import type { NotebookDetailDto, NotebookListItemDto } from "@/types/api/notebooks";
import type { NotebookScenarioDto, SavedReportDto } from "@/types/api/reports";
import type { ScheduleDto } from "@/types/api/schedules";
import type { NotebookTemplateDto, QueryTemplateDto } from "@/types/api/templates";
import {
  deterministicSqlTopCancelledCities,
  topCityCancellations,
  topCityLimitFromPrompt
} from "@/lib/demo/seeded-data";

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
  }
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
  return {
    id: "user-mock",
    email: "you@company.com",
    full_name: "Пользователь",
    role: "manager",
    workspace_id: "ws-1"
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

export async function mockRunAnalytics(notebookId: string, prompt: string): Promise<RunNotebookAnalyticsResponseDto> {
  const topLimit = topCityLimitFromPrompt(prompt, 3);
  const rows = topCityCancellations(topLimit);
  const topLabel = `топ-${topLimit}`;
  const tablePayload = {
    columns: [
      "city_id",
      "cancelled_orders",
      "avg_price_order_local",
      "avg_duration_in_seconds",
      "avg_distance_in_meters"
    ],
    rows,
    caption: `Mock dataset: ${topLabel} города по отменам (текущая неделя)`
  };
  const chartPayload = {
    chartType: "bar",
    recommendedChartType: "bar",
    alternativeChartTypes: ["horizontal_bar", "table"],
    visualizationExplanation: "Bar chart стабильно отображает ranking городов по отменам.",
    title: `${topLabel[0]?.toUpperCase() ?? "Т"}${topLabel.slice(1)} города по отменённым заказам`,
    xKey: "city_id",
    series: [{ key: "cancelled_orders", name: "Отмены" }],
    data: tablePayload.rows
  };
  const normalizedPrompt = prompt.toLowerCase();
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
  const traceModel: AnalyticsTraceDto = {
    ...trace,
    interpreted_intent: `ranking · cancelled_orders_by_city(top_${topLimit})`,
    generated_sql: deterministicSqlTopCancelledCities(topLimit)
  };

  return {
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
        content: "Намерение: ranking отмен по городам · метрика: cancelled_orders · период: текущая неделя",
        position: 2
      },
      {
        id: `${notebookId}-sql1`,
        notebook_id: notebookId,
        type: "sql",
        content: deterministicSqlTopCancelledCities(topLimit),
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
        content: [
          `Инсайт по запросу: «${prompt}».`,
          `Лидер по отменам: ${rows[0]?.city_id ?? "—"} (${rows[0]?.cancelled_orders ?? 0}).`,
          "Рекомендуемый guardrail: алерт при росте отмен > 10% WoW."
        ].join("\n"),
        position: 6
      }
    ],
    trace: traceModel
  };
}

export async function mockListReports(): Promise<SavedReportDto[]> {
  return [
    {
      id: "r1",
      name: "Еженедельный KPI-пак",
      owner_email: "finance@acme.co",
      updated_at: "2026-04-20T06:00:00Z",
      schedule: "active",
      format: "pdf",
      notebook_id: "nb-1"
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
      validation_hint: "Lint OK",
      duration_ms: 890
    }
  ];
}

export async function mockListDictionary(): Promise<DictionaryEntryDto[]> {
  return [
    {
      id: "d-1",
      term: "Завершенные поездки",
      synonyms: ["completed rides"],
      sql_expression: "COUNT(CASE WHEN driverdone_timestamp IS NOT NULL THEN 1 END)",
      visibility_roles: ["admin", "manager", "marketer", "executive"]
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
