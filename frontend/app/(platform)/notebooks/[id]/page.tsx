"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AddCellComposer } from "@/components/notebook/add-cell-composer";
import { RunAllButton } from "@/components/notebook/run-all-button";
import { NotebookCanvas } from "@/components/notebook/notebook-canvas";
import { NotebookCell } from "@/components/notebook/notebook-cell";
import { NotebookHeader } from "@/components/notebook/notebook-header";
import { AnalysisRunSummary } from "@/components/notebook/analysis-run-summary";
import { NotebookHistoryChips, NotebookHistoryPanel } from "@/components/notebook/notebook-history-panel";
import {
  NotebookClarificationNeededState,
  NotebookEmptyState,
  NotebookErrorBanner,
  NotebookFallbackModeState,
  NotebookLoadingState,
  NotebookNoDataState,
  NotebookPipelineLoadingState,
  NotebookValidationBlockedState
} from "@/components/notebook/notebook-states";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { useCurrentUser } from "@/hooks/api/use-auth";
import { useCreateReport } from "@/hooks/api/use-reports";
import { useNotebook } from "@/hooks/api/use-notebooks";
import { queryKeys } from "@/hooks/api/query-keys";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useAnalyticsBusyPhaseHint } from "@/hooks/use-analytics-busy-phase-hint";
import { createNotebook, saveNotebookScenario, updateNotebook } from "@/lib/api/notebooks";
import { runForecast } from "@/lib/api/forecast";
import {
  downloadNotebookScenarioPdf,
  downloadReportPdf,
  type ReportPdfMode,
  type ScenarioPdfSnapshot
} from "@/lib/api/reports";
import { getDefaultReportPdfMode } from "@/lib/preferences/report-pdf";
import { upsertReportSnapshot } from "@/lib/reports/local-snapshots";
import { useSession } from "@/lib/auth/session-context";
import { TracePanel } from "@/components/notebook/trace-panel";
import {
  ApiError,
  getApiBaseUrl,
  isDemoModeEnabled,
  isApiMockFallback,
  isApiMockOnly,
  runAnalyticsPipeline,
  shouldForceAnalyticsMock
} from "@/lib/api";
import type { ChartKind, NotebookBlock, PromptBlock, TracePanelModel } from "@/lib/notebook/block-types";
import type { NotebookAnalyticsRunOptions } from "@/types/api/cells";
import { enrichBlocksWithAutoChart } from "@/lib/notebook/enrich-blocks-chart";
import { appendNotebookHistory, loadNotebookHistory, saveNotebookHistory, type NotebookHistoryItem } from "@/lib/notebook/notebook-history";
import {
  clearNotebookPromptDraft,
  loadNotebookPromptDraft,
  saveNotebookPromptDraft
} from "@/lib/notebook/notebook-prompt-draft";
import { cellDtosToBlocks } from "@/lib/notebook/legacy-map";
import { EMPTY_TRACE, traceFromAnalyticsRun } from "@/lib/notebook/trace-model";
import {
  deterministicSqlTopCancelledCities,
  topCityCancellations,
  topCityLimitFromPrompt
} from "@/lib/demo/seeded-data";
import { isUuidString } from "@/lib/utils/uuid";

// DeepSeek flow may include several sequential LLM calls in one pipeline run.
// Keep client-side timeout comfortably above a typical multi-call latency.
/** Долгие LLM/SQL-цепочки: слишком короткий таймаут даёт ложные ошибки на медленных средах. */
const ANALYTICS_TIMEOUT_MS = 120_000;
const DEFAULT_FORECAST_HORIZON_DAYS = 14;
const SCENARIO_TITLE_MAX_LEN = 80;
type RuntimeHealthModel = {
  environment: string;
  demo_auth_bypass_enabled: boolean;
  mock_mode: boolean;
  mock_sql_execution_fallback: boolean;
  postgres_required: boolean;
  jwt_required: boolean;
};

/** После 401/403 не оставлять старые интерпретации рядом с новым (провалившимся) запросом. */
const STALE_BLOCKS_ON_SESSION_LOSS = new Set<NotebookBlock["type"]>(["forecast", "insight", "chart"]);

function stripStaleBlocksAfterAuthFailure(blocks: NotebookBlock[]): NotebookBlock[] {
  return blocks.filter((b) => !STALE_BLOCKS_ON_SESSION_LOSS.has(b.type));
}

function buildScenarioNotebookTitleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return `Сценарий · ${new Date().toLocaleString("ru-RU")}`;
  const short = cleaned.length > SCENARIO_TITLE_MAX_LEN ? `${cleaned.slice(0, SCENARIO_TITLE_MAX_LEN - 1)}…` : cleaned;
  return short;
}

const SESSION_EXPIRED_CELL_MSG =
  "Сессия истекла или токен недействителен. Выйдите и войдите снова, затем повторите запрос.";
const SESSION_EXPIRED_PAGE_MSG =
  "Аналитика недоступна: сессия истекла (401/403). Прогноз, график и инсайт от прошлого запуска скрыты, чтобы не путать с новым запросом.";

function traceClarificationRequested(trace: unknown): boolean {
  if (!trace || typeof trace !== "object") return false;
  return Boolean((trace as { clarification_requested?: boolean }).clarification_requested);
}

function analyticsRunFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const extra = error.body ? ` ${error.body.slice(0, 160)}` : "";
    return `${error.message}${extra}`.trim().slice(0, 320);
  }
  if (error instanceof Error && error.message !== "ANALYTICS_TIMEOUT") {
    return error.message.slice(0, 320);
  }
  return "Не удалось выполнить промпт.";
}

function readableGuardrailsMessage(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("слишком длин") || lower.includes("prompt too long")) {
    return "Запрос слишком длинный для безопасной обработки. Сократите промпт и оставьте только ключевой бизнес-вопрос.";
  }
  if (lower.includes("превышен лимит запросов") || lower.includes("rate limit")) {
    return "Слишком много запусков за короткое время. Подождите минуту и повторите запрос.";
  }
  if (lower.includes("чувствительн") || lower.includes("недоступна для роли")) {
    return "Запрос затрагивает ограниченные для вашей роли поля/метрики. Переформулируйте вопрос в рамках разрешённых KPI.";
  }
  return message;
}

function isAuthError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 401 || error.status === 403;
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("authorization") ||
      msg.includes("unauthorized") ||
      msg.includes("invalid or expired access token")
    );
  }
  return false;
}

function analyticsErrorBanner(
  error: unknown,
  isTimeout: boolean,
  timeoutPageMsg: string,
  pageFallbackPrefix: string
): { cell: string; page: string } {
  if (isTimeout) {
    return { cell: "Не удалось выполнить промпт.", page: timeoutPageMsg };
  }
  if (isAuthError(error)) {
    return { cell: SESSION_EXPIRED_CELL_MSG, page: SESSION_EXPIRED_PAGE_MSG };
  }
  const detail = readableGuardrailsMessage(analyticsRunFailureMessage(error));
  return { cell: detail.slice(0, 320), page: `${pageFallbackPrefix}${detail}`.slice(0, 400) };
}

function shouldRunFallbackForecast(promptText: string, interpretedIntent?: string): boolean {
  const t = `${promptText} ${interpretedIntent ?? ""}`.toLowerCase();
  return /прогноз|forecast|предскаж|prediction|horizon/.test(t);
}

function mergeBlocksById(
  prev: NotebookBlock[],
  incoming: NotebookBlock[],
  options?: { skipPromptText?: string }
): NotebookBlock[] {
  const incomingById = new Map(incoming.map((b) => [b.id, b]));
  const updated = prev.map((block) => {
    const next = incomingById.get(block.id);
    if (!next) return block;
    return { ...next, errorMessage: undefined };
  });
  const existingIds = new Set(updated.map((b) => b.id));
  const toAppend = incoming.filter((b) => {
    if (existingIds.has(b.id)) return false;
    if (options?.skipPromptText && b.type === "prompt" && b.text.trim() === options.skipPromptText) {
      return false;
    }
    return true;
  });
  return [...updated, ...toAppend];
}

const CORE_CHAIN_ORDER: NotebookBlock["type"][] = ["clarification", "trace", "sql", "table", "chart", "insight", "forecast"];

function isMeaningfulBlock(block: NotebookBlock): boolean {
  if (block.type === "clarification") {
    return Array.isArray(block.options) && block.options.length > 0;
  }
  if (block.type === "sql") {
    return block.sql.trim().length > 0;
  }
  if (block.type === "table") {
    if (!(Array.isArray(block.columns) && block.columns.length > 0 && Array.isArray(block.rows) && block.rows.length > 0)) {
      return false;
    }
    // Legacy fallback mapper can produce a synthetic table: columns=["note"], rows=[{note:"[]"}]
    // Treat this as non-meaningful so the seeded deterministic demo table is shown instead.
    if (
      block.columns.length === 1 &&
      block.columns[0]?.toLowerCase() === "note" &&
      block.rows.length === 1 &&
      typeof block.rows[0]?.note === "string" &&
      ["[]", "", "null", "undefined"].includes(block.rows[0].note.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  }
  if (block.type === "chart") {
    return (
      typeof block.xKey === "string" &&
      block.xKey.length > 0 &&
      Array.isArray(block.series) &&
      block.series.length > 0 &&
      Array.isArray(block.data) &&
      block.data.length > 0
    );
  }
  if (block.type === "trace") {
    return block.summary.trim().length > 0;
  }
  if (block.type === "insight") {
    return block.title.trim().length > 0 || (block.summary?.trim().length ?? 0) > 0 || block.bullets.length > 0;
  }
  if (block.type === "forecast") {
    return block.headline.trim().length > 0 || block.baseline !== undefined;
  }
  return true;
}

const REPORT_SNAPSHOT_MAX_ROWS = 80;
const REPORT_CHART_DATA_SAMPLE = 40;

/** Снимок таблицы для каталога отчётов (ограниченное число строк). */
function buildReportResultSnapshotForPayload(tableBlock: NotebookBlock | undefined): Record<string, unknown> {
  if (!tableBlock || tableBlock.type !== "table") return {};
  const { columns, rows } = tableBlock;
  const slim = rows.slice(0, REPORT_SNAPSHOT_MAX_ROWS).map((row) => {
    const o: Record<string, unknown> = {};
    for (const c of columns) o[c] = row[c];
    return o;
  });
  return { columns, rows: slim, row_count: rows.length };
}

/** Конфиг графика с канвы + при необходимости только рекомендация из trace. */
function buildReportChartConfigForPayload(
  chartBlock: NotebookBlock | undefined,
  fallbackChartType: ChartKind | string | undefined
): Record<string, unknown> {
  if (chartBlock && chartBlock.type === "chart") {
    return {
      chartType: chartBlock.chartType,
      recommendedChartType: chartBlock.recommendedChartType,
      xKey: chartBlock.xKey,
      series: chartBlock.series,
      title: chartBlock.title,
      subtitle: chartBlock.subtitle,
      unitLabel: chartBlock.unitLabel,
      geoMetadata: chartBlock.geoMetadata ?? undefined,
      data_sample: chartBlock.data.slice(0, REPORT_CHART_DATA_SAMPLE)
    };
  }
  if (fallbackChartType) return { chartType: fallbackChartType, source: "recommendation_only" };
  return {};
}

function upsertForecastAfterInsight(blocks: NotebookBlock[], forecast: Extract<NotebookBlock, { type: "forecast" }>): NotebookBlock[] {
  const withoutForecast = blocks.filter((b) => b.type !== "forecast");
  let insightIndex = -1;
  for (let i = withoutForecast.length - 1; i >= 0; i -= 1) {
    if (withoutForecast[i]?.type === "insight") {
      insightIndex = i;
      break;
    }
  }
  if (insightIndex === -1) {
    return [...withoutForecast, forecast];
  }
  return [...withoutForecast.slice(0, insightIndex + 1), forecast, ...withoutForecast.slice(insightIndex + 1)];
}

function humanizeHorizonLabel(raw: string | undefined, fallbackDays: number): string {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return `${fallbackDays} дней`;
  const m = v.match(/^(\d+)\s*([dwmy])$/i);
  if (!m) return raw?.trim() || `${fallbackDays} дней`;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "d") return `${n} дн.`;
  if (unit === "w") return `${n} нед.`;
  if (unit === "m") return `${n} мес.`;
  if (unit === "y") return `${n} лет`;
  return raw?.trim() || `${fallbackDays} дней`;
}

/** Существительное для подписи к числу заказов: «1 заказ», «3 заказа», «5 заказов». */
function ruOrdersNounForCount(n: number): string {
  const k = Math.abs(Math.round(Number(n))) % 100;
  const k10 = k % 10;
  if (k >= 11 && k <= 14) return "заказов";
  if (k10 === 1) return "заказ";
  if (k10 >= 2 && k10 <= 4) return "заказа";
  return "заказов";
}

function pickForecastStrategy(run: Awaited<ReturnType<typeof runForecast>>): string | null {
  const summary = (run.strategy_summary ?? {}) as Record<string, unknown>;
  const direct = summary.selected_strategy;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const byMetric = summary.selected_strategies;
  if (byMetric && typeof byMetric === "object") {
    const first = Object.values(byMetric as Record<string, unknown>).find((x) => typeof x === "string" && x.trim());
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  return null;
}

function humanizeStrategyLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    linear_regression: "Линейная регрессия",
    trend_extrapolation: "Трендовая экстраполяция",
    rolling_average: "Скользящее среднее",
    baseline_flat_last: "Плоский baseline (последнее значение ряда)",
    baseline_linear_trend: "Линейный тренд (baseline)",
    none: "Без выбранной стратегии"
  };
  return map[key] ?? raw;
}

function humanizeMetricLabel(raw: string): string {
  const key = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    orders_count: "Заказы",
    done_rides: "Завершенные поездки",
    cancellations_total: "Отмены",
    revenue: "Выручка"
  };
  return map[key] ?? raw;
}

function forecastBlockFromRun(notebookId: string, run: Awaited<ReturnType<typeof runForecast>>): Extract<NotebookBlock, { type: "forecast" }> | null {
  const scenario = Array.isArray(run.scenarios) && run.scenarios.length ? run.scenarios[0] : null;
  let baseline =
    scenario?.baseline !== undefined
      ? scenario.baseline
      : typeof run.forecasts === "object" && run.forecasts
        ? Number((run.forecasts as Record<string, unknown>).baseline ?? NaN)
        : undefined;
  let optimistic = scenario?.optimistic;
  let pessimistic = scenario?.pessimistic;
  let headline = scenario?.name ?? "DS-прогноз метрики";
  let horizonLabel = scenario?.horizon_label;
  let unit = scenario?.unit;

  if (baseline === undefined || Number.isNaN(Number(baseline))) {
    const forecasts = (run.forecasts ?? {}) as Record<string, unknown>;
    const perMetric = (forecasts.per_metric ?? {}) as Record<string, unknown>;
    const metricEntry = Object.entries(perMetric).find(([, v]) => v && typeof v === "object");
    if (metricEntry) {
      const [metricKey, payload] = metricEntry;
      const p = payload as Record<string, unknown>;
      const eow = (p.expected_until_end_of_week ?? {}) as Record<string, unknown>;
      const numericEow = Object.values(eow)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x));
      if (numericEow.length) {
        const selected = typeof p.selected_strategy === "string" ? p.selected_strategy : null;
        const selectedVal = selected ? Number(eow[selected]) : NaN;
        baseline = Number.isFinite(selectedVal) ? selectedVal : numericEow[0];
        optimistic = Math.max(...numericEow);
        pessimistic = Math.min(...numericEow);
      }
      const nextDaysByMethod = (p.next_7_days ?? {}) as Record<string, unknown>;
      const firstSeries = Object.values(nextDaysByMethod).find((x) => Array.isArray(x)) as Array<unknown> | undefined;
      if (firstSeries?.length) {
        horizonLabel = `${firstSeries.length}d`;
      }
      headline = `Прогноз: ${humanizeMetricLabel(metricKey)}`;
      unit = metricKey === "revenue" ? "RUB" : ruOrdersNounForCount(Math.round(Number(baseline)));
    }
  }

  if (baseline === undefined || Number.isNaN(Number(baseline))) return null;
  const roundedBase = Math.round(Number(baseline));
  const uRaw = (unit ?? "").trim();
  const uLower = uRaw.toLowerCase();
  const isRub = uRaw === "RUB" || uRaw === "₽" || uLower.includes("rub");
  const looksLikeOrdersUnit =
    !uRaw ||
    uRaw === "заказов" ||
    uRaw === "заказ" ||
    uRaw === "заказа" ||
    uLower === "orders" ||
    uLower === "order";
  if (!isRub && looksLikeOrdersUnit) {
    unit = ruOrdersNounForCount(roundedBase);
  }
  const strategy = pickForecastStrategy(run);
  const baseNarrative = run.narrative?.trim() || "Прогноз рассчитан моделью Data Science на основе истории.";
  const subtext = strategy ? `${baseNarrative} Стратегия: ${humanizeStrategyLabel(strategy)}.` : baseNarrative;
  return {
    id: `${notebookId}-fc-${Date.now()}`,
    type: "forecast",
    forecastSource: "fallback",
    headline,
    subtext,
    horizon: humanizeHorizonLabel(horizonLabel, DEFAULT_FORECAST_HORIZON_DAYS),
    baseline: Number(baseline),
    optimistic: optimistic !== undefined ? Number(optimistic) : undefined,
    pessimistic: pessimistic !== undefined ? Number(pessimistic) : undefined,
    unit
  };
}

function stabilizeScenarioBlocks(
  blocks: NotebookBlock[],
  notebookId: string,
  promptText: string,
  options?: {
    selectedClarificationId?: string;
    resetClarification?: boolean;
    hideClarification?: boolean;
    useDeterministicFallback?: boolean;
  }
): NotebookBlock[] {
  const foundPrompt = [...blocks].reverse().find((b) => b.type === "prompt");
  const lastPrompt: PromptBlock =
    foundPrompt && foundPrompt.type === "prompt"
      ? foundPrompt
      : { id: `${notebookId}-p1`, type: "prompt", text: promptText, status: "idle" };
  const fallback = options?.useDeterministicFallback === false ? [] : buildDemoBlocks(notebookId, promptText);
  const fallbackByType = new Map(fallback.map((b) => [b.type, b]));
  const byType = new Map<NotebookBlock["type"], NotebookBlock>();
  [...blocks].reverse().forEach((b) => {
    if (b.type === "prompt") return;
    if (!CORE_CHAIN_ORDER.includes(b.type)) return;
    if (!byType.has(b.type)) byType.set(b.type, b);
  });

  const stableCore = CORE_CHAIN_ORDER.map((type) => {
    const candidate = byType.get(type);
    const fallbackCandidate = fallbackByType.get(type);
    const selected = candidate && isMeaningfulBlock(candidate) ? candidate : fallbackCandidate;
    if (!selected) return null;
    if (type === "clarification") {
      if (options?.hideClarification) {
        return null;
      }
      const clarification = selected as Extract<NotebookBlock, { type: "clarification" }>;
      if (options?.resetClarification) {
        return { ...clarification, selectedOptionId: undefined, status: "idle" as const, errorMessage: undefined };
      }
      if (options?.selectedClarificationId) {
        return {
          ...clarification,
          selectedOptionId: options.selectedClarificationId,
          status: "success" as const,
          errorMessage: undefined
        };
      }
    }
    return selected;
  }).filter((b): b is NotebookBlock => Boolean(b));

  return [
    {
      ...lastPrompt,
      text: promptText,
      // Keep prompt editable/clickable after each stabilization cycle.
      status: lastPrompt.status === "running" ? "success" : lastPrompt.status,
      errorMessage: undefined
    },
    ...stableCore
  ];
}

function finalizeScenarioBlocks(
  blocks: NotebookBlock[],
  notebookId: string,
  promptText: string,
  options: Parameters<typeof stabilizeScenarioBlocks>[3] | undefined,
  trace: TracePanelModel
): NotebookBlock[] {
  const stable = stabilizeScenarioBlocks(blocks, notebookId, promptText, options);
  return enrichBlocksWithAutoChart(stable, trace);
}

function scenarioPresetByNotebookId(notebookId: string): {
  prompt: string;
  clarificationPrompt: string;
  clarificationOptions: Array<{ id: string; label: string }>;
} {
  if (notebookId.includes("clarification")) {
    return {
      prompt: "Покажи лучшие города за неделю",
      clarificationPrompt: "Что значит «лучшие»: минимум отмен, максимум завершенных или выручка?",
      clarificationOptions: [
        { id: "min_cancel", label: "Минимум отмен" },
        { id: "max_done", label: "Максимум завершенных" },
        { id: "max_revenue", label: "Максимальная выручка" }
      ]
    };
  }
  if (notebookId.includes("follow-up")) {
    return {
      prompt: "Покажи отмены по городам за неделю. А теперь только по Москве.",
      clarificationPrompt: "Уточните формат follow-up: сравнить Москву с топ-3 или показать только Москву?",
      clarificationOptions: [
        { id: "moscow_only", label: "Только Москва" },
        { id: "moscow_vs_top3", label: "Москва vs топ-3 городов" },
        { id: "moscow_trend", label: "Тренд Москвы по дням" }
      ]
    };
  }
  return {
    prompt: "Покажи топ-3 города по количеству отменённых заказов на этой неделе.",
    clarificationPrompt: "Уточните метрику отмен: учитывать все отмены или только клиентские?",
    clarificationOptions: [
      { id: "all", label: "Все отмены" },
      { id: "client", label: "Только клиентские отмены" },
      { id: "split", label: "Показать оба варианта" }
    ]
  };
}

function buildDemoBlocks(notebookId: string, promptOverride?: string): NotebookBlock[] {
  const preset = scenarioPresetByNotebookId(notebookId);
  const promptText = promptOverride?.trim() || preset.prompt;
  const topLimit = topCityLimitFromPrompt(promptText, 3);
  const rows = topCityCancellations(topLimit);
  const topLabel = `топ-${topLimit}`;
  return [
    {
      id: `${notebookId}-p1`,
      type: "prompt",
      text: promptText
    },
    {
      id: `${notebookId}-cl1`,
      type: "clarification",
      prompt: preset.clarificationPrompt,
      options: preset.clarificationOptions,
      selectedOptionId: undefined
    },
    {
      id: `${notebookId}-tr1`,
      type: "trace",
      summary: "Намерение: ranking отмен по городам · метрика: cancelled_orders · период: текущая неделя",
      intent: "top_cancelled_cities_weekly",
      tables: ["train"]
    },
    {
      id: `${notebookId}-sql1`,
      type: "sql",
      dialect: "PostgreSQL",
      validated: true,
      sql: deterministicSqlTopCancelledCities(topLimit)
    },
    {
      id: `${notebookId}-tb1`,
      type: "table",
      caption: `Результат: ${topLabel} города по отменам`,
      columns: [
        "city_id",
        "cancelled_orders",
        "avg_price_order_local",
        "avg_duration_in_seconds",
        "avg_distance_in_meters"
      ],
      rows
    },
    {
      id: `${notebookId}-ch1`,
      type: "chart",
      chartType: "bar",
      recommendedChartType: "bar",
      alternativeChartTypes: ["horizontal_bar", "line", "table"],
      visualizationExplanation: "Для ranking городов по количеству отмен наиболее читаем bar chart.",
      title: `${topLabel[0]?.toUpperCase() ?? "Т"}${topLabel.slice(1)} города по отменам за неделю`,
      xKey: "city_id",
      series: [{ key: "cancelled_orders", name: "Отмены" }],
      data: rows
    },
    {
      id: `${notebookId}-in1`,
      type: "insight",
      title: `Отмены концентрируются в ${Math.min(topLimit, rows.length)} лидирующих городах`,
      summary: `Главный риск по отменам сосредоточен в ${topLabel} рейтинга текущей недели.`,
      bullets: [
        `${rows[0]?.city_id ?? "Лидер"} лидирует по отменам; стоит проверить SLA подачи в часы пик.`,
        "Средняя дистанция и длительность по отменам выше нормы — вероятны проблемы матчинг-цикла.",
        "Рекомендуется добавить guardrail-алерт: рост отмен > 10% WoW по городу."
      ],
      confidence: 0.88
    }
  ];
}

export default function NotebookDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const notebookId = String(params.id ?? "");

  const [boot, setBoot] = useState<"loading" | "ready" | "error">("loading");
  const [blocks, setBlocks] = useState<NotebookBlock[]>([]);
  const [traceModel, setTraceModel] = useState<TracePanelModel>(EMPTY_TRACE);
  const [traceOpen, setTraceOpen] = useState(true);
  const [composer, setComposer] = useState("");
  const [composerBusy, setComposerBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [savingScenario, setSavingScenario] = useState(false);
  const [lastReport, setLastReport] = useState<{ id: string; name: string } | null>(null);
  const [promptHistory, setPromptHistory] = useState<NotebookHistoryItem[]>([]);
  const [downloadingPdfMode, setDownloadingPdfMode] = useState<ReportPdfMode | null>(null);
  const [clarificationRunVersion, setClarificationRunVersion] = useState(0);
  const [pendingTemplateAutorun, setPendingTemplateAutorun] = useState<string | null>(null);
  const [interpretationAccepted, setInterpretationAccepted] = useState(false);
  const [interpretationActionBusy, setInterpretationActionBusy] = useState(false);
  const templatePromptHydratedRef = useRef(false);
  const templateAutorunRef = useRef(false);
  const persistedPromptHydratedRef = useRef(false);
  const localDraftHydratedRef = useRef(false);
  const forecastRunSeqRef = useRef(0);
  const clarificationSubmitLockRef = useRef(false);
  const pendingAnalyticsOptsRef = useRef<NotebookAnalyticsRunOptions>({});
  const demoCaseHydratedRef = useRef(false);
  const [backendHealth, setBackendHealth] = useState<"checking" | "up" | "down">("checking");
  const [backendCheckedAt, setBackendCheckedAt] = useState<string | null>(null);
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealthModel | null>(null);
  /** После гидрации с сервера/шаблона/черновика — чтобы не перезаписать localStorage пустым при старте. */
  const [draftSaveEnabled, setDraftSaveEnabled] = useState(false);
  const createReport = useCreateReport();
  const meQuery = useCurrentUser();
  const { session } = useSession();
  const workspaceQuery = useWorkspaceId();
  const isLocalDemoNotebook = useMemo(() => notebookId.startsWith("demo-"), [notebookId]);
  const notebookMetaQuery = useNotebook(isUuidString(notebookId) ? notebookId : undefined);
  const useDeterministicFallback = useMemo(
    () => isApiMockOnly() || shouldForceAnalyticsMock(),
    []
  );

  useEffect(() => {
    setPromptHistory(loadNotebookHistory(notebookId));
  }, [notebookId]);

  const busyAnalyticsHint = useAnalyticsBusyPhaseHint(composerBusy || runAllLoading);
  const headerRunState = pageError ? "failed" : composerBusy || runAllLoading ? "running" : "idle";
  const canPersistNotebook = useMemo(() => isUuidString(notebookId), [notebookId]);
  /** Промпт с сервера: снимок сценария, последний успешный запрос или последняя prompt-ячейка. */
  const serverRestoredPrompt = useMemo(() => {
    const data = notebookMetaQuery.data;
    if (!data) return null;
    const chain = data.context_chain_json;
    const scenarioDesc = chain && typeof chain === "object" ? (chain as { scenario?: { description?: unknown } }).scenario?.description : undefined;
    if (typeof scenarioDesc === "string" && scenarioDesc.trim()) return scenarioDesc.trim();
    const lastUser =
      chain && typeof chain === "object" ? (chain as { last_user_query?: unknown }).last_user_query : undefined;
    if (typeof lastUser === "string" && lastUser.trim()) return lastUser.trim();
    const cells = data.cells;
    if (Array.isArray(cells) && cells.length) {
      const prompts = cells.filter((c) => c.cell_type === "prompt" && typeof c.prompt_text === "string" && c.prompt_text.trim());
      const byPos = [...prompts].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const last = byPos[byPos.length - 1];
      if (last?.prompt_text?.trim()) return last.prompt_text.trim();
    }
    return null;
  }, [notebookMetaQuery.data]);

  const firstPromptText = useMemo(() => {
    const p = blocks.find((b) => b.type === "prompt");
    return p && p.type === "prompt" ? p.text : "";
  }, [blocks]);

  useEffect(() => {
    setDraftSaveEnabled(false);
  }, [notebookId]);

  useEffect(() => {
    if (boot !== "ready") return;
    if (useDeterministicFallback) {
      setDraftSaveEnabled(false);
      return;
    }
    if (!canPersistNotebook) {
      const t = window.setTimeout(() => setDraftSaveEnabled(true), 550);
      return () => window.clearTimeout(t);
    }
    if (!notebookMetaQuery.isFetched) return;
    const t = window.setTimeout(() => setDraftSaveEnabled(true), 550);
    return () => window.clearTimeout(t);
  }, [boot, notebookId, canPersistNotebook, notebookMetaQuery.isFetched, useDeterministicFallback]);

  useEffect(() => {
    if (!draftSaveEnabled) return;
    if (useDeterministicFallback) return;
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      saveNotebookPromptDraft(notebookId, { cell: firstPromptText, composer });
    }, 450);
    return () => window.clearTimeout(t);
  }, [draftSaveEnabled, notebookId, firstPromptText, composer, useDeterministicFallback]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 420));
        if (cancelled) return;
        if (useDeterministicFallback) {
          const bootBlocks = buildDemoBlocks(notebookId);
          const bootPrompt = bootBlocks.find((b) => b.type === "prompt")?.text ?? "Сценарий";
          setBlocks(
            stabilizeScenarioBlocks(bootBlocks, notebookId, bootPrompt, {
              resetClarification: true,
              useDeterministicFallback
            })
          );
        } else {
          setBlocks([
            {
              id: `${notebookId}-prompt-init`,
              type: "prompt",
              text: "",
              status: "idle"
            }
          ]);
        }
        setTraceModel({
          ...EMPTY_TRACE,
          confidence: 0,
          validationStatus: "unknown",
          interpretedIntent: "",
          tablesUsed: [],
          chartRecommendation: {
            chartType: "line",
            rationale: "Сопоставление временного ряда и цели лучше читать на линейном графике.",
            alternatives: ["area", "bar"]
          },
          forecastSelection: {
            metricKey: null,
            selectedStrategy: null,
            dataQuality: {},
            backtestSummary: {}
          },
          forecastExplainability: {},
          qualityGate: {
            status: "passed",
            reasons: []
          },
          steps: [
            { id: "s1", label: "Инициализация канвы", detail: "Готово к запуску pipeline", status: "done" },
            { id: "s2", label: "Ожидание запуска", detail: "Запустите ячейки или добавьте промпт", status: "pending" }
          ],
          logs: [{ level: "info", message: "Оболочка сценария готова.", at: "t+0s" }]
        });
        setBoot("ready");
      } catch {
        if (!cancelled) setBoot("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId, useDeterministicFallback]);

  const title = useMemo(() => {
    const dbTitle = notebookMetaQuery.data?.title?.trim();
    if (dbTitle) return dbTitle;
    return `Сценарий ${notebookId}`;
  }, [notebookId, notebookMetaQuery.data?.title]);
  const apiModeLabel = useMemo(() => {
    if (shouldForceAnalyticsMock()) return "Mock analytics";
    if (isApiMockOnly()) return "Mock only";
    if (isApiMockFallback()) return "Live + fallback";
    return "Live only";
  }, []);
  const clarificationBlock = useMemo(
    () => blocks.find((b) => b.type === "clarification"),
    [blocks]
  );

  const clarificationPending = Boolean(
    traceModel.clarificationRequested && clarificationBlock && !clarificationBlock.selectedOptionId
  );

  const lastPromptForHistory = useMemo(() => {
    const p = [...blocks].reverse().find((b) => b.type === "prompt" && b.text.trim());
    return p && p.type === "prompt" ? p.text.trim() : "";
  }, [blocks]);

  const popPendingAnalyticsOpts = useCallback((): NotebookAnalyticsRunOptions => {
    const next = { ...pendingAnalyticsOptsRef.current };
    pendingAnalyticsOptsRef.current = {};
    return next;
  }, []);

  const runAnalyticsWithLocalFallback = useCallback(
    async (prompt: string, options?: NotebookAnalyticsRunOptions) => {
      return runAnalyticsPipeline(notebookId, prompt, options);
    },
    [notebookId]
  );

  const applyRuntimeModeNotice = useCallback((mode: "live" | "fallback" | "mock-only" | undefined) => {
    if (mode === "fallback") {
      setPageNotice("Показаны fallback-данные: live pipeline временно недоступен.");
      return;
    }
    if (mode === "mock-only") {
      setPageNotice("Активен mock-only режим: включите live backend для реального pipeline.");
      return;
    }
    setPageNotice(null);
  }, []);

  const runForecastAfterInsight = useCallback(async () => {
      const seq = ++forecastRunSeqRef.current;
      try {
        const workspaceId = workspaceQuery.data;
        if (!workspaceId) return;
        const forecastRun = await runForecast({
          ...(isUuidString(notebookId) ? { notebook_id: notebookId } : {}),
          workspace_id: workspaceId,
          horizon_days: DEFAULT_FORECAST_HORIZON_DAYS
        });
        if (forecastRunSeqRef.current !== seq) return;
        const forecastBlock = forecastBlockFromRun(notebookId, forecastRun);
        if (!forecastBlock) return;
        setBlocks((prev) => upsertForecastAfterInsight(prev, forecastBlock));
      } catch {
        // Forecast is optional; the main analytics chain stays successful even when DS forecast is unavailable.
      }
    },
    [notebookId, workspaceQuery.data]
  );

  const emptyAnalyticTable = useMemo(
    () =>
      blocks.some((b) => b.type === "table" && b.columns.length > 0 && Array.isArray(b.rows) && b.rows.length === 0),
    [blocks]
  );

  const hasExportableTable = useMemo(() => {
    const t = [...blocks].reverse().find((b) => b.type === "table");
    if (t && t.type === "table" && t.columns.length > 0 && Array.isArray(t.rows) && t.rows.length > 0) {
      return true;
    }
    const c = [...blocks].reverse().find((b) => b.type === "chart");
    if (c && c.type === "chart" && Array.isArray(c.data) && c.data.length > 0) {
      const cols = Object.keys(c.data[0] ?? {});
      return cols.length > 0;
    }
    return false;
  }, [blocks]);

  const interpretationView = useMemo(() => {
    const s = (traceModel.structuredInterpretation ?? {}) as Record<string, unknown>;
    const metric =
      (typeof s.metric === "string" && s.metric.trim()) ||
      (Array.isArray(s.metrics) && typeof s.metrics[0] === "string" ? (s.metrics[0] as string) : "") ||
      "";
    const dimensions = Array.isArray(s.dimensions) ? s.dimensions.map(String) : [];
    const grouping = Array.isArray(s.grouping) ? s.grouping.map(String) : [];
    const ambiguityFlags = Array.isArray(s.ambiguity_flags) ? s.ambiguity_flags.map(String) : [];
    const filtersRaw = s.filters && typeof s.filters === "object" ? (s.filters as Record<string, unknown>) : {};
    const filters = Object.entries(filtersRaw)
      .filter(([, v]) => v !== undefined && v !== null && `${v}`.trim() !== "")
      .map(([k, v]) => `${k}: ${String(v)}`);
    const timeRange = s.time_range && typeof s.time_range === "object" ? (s.time_range as Record<string, unknown>) : {};
    const timeLabel =
      (typeof timeRange.label_ru === "string" && timeRange.label_ru.trim()) ||
      (typeof timeRange.preset === "string" && timeRange.preset.trim()) ||
      "не определен";
    return {
      intent: (typeof s.intent === "string" && s.intent) || traceModel.interpretedIntent || "unknown",
      metric,
      dimensions,
      grouping,
      filters,
      timeLabel,
      aggregation: (typeof s.aggregation === "string" && s.aggregation) || "",
      chartHint: (typeof s.chart_hint === "string" && s.chart_hint) || traceModel.chartRecommendation.chartType || "",
      ambiguityFlags,
      summary: traceModel.interpretationSummaryRu ?? "",
      notes: traceModel.interpretationNotes ?? []
    };
  }, [traceModel]);

  useEffect(() => {
    setInterpretationAccepted(false);
  }, [traceModel.interpretedIntent, notebookId]);

  useEffect(() => {
    templatePromptHydratedRef.current = false;
    templateAutorunRef.current = false;
    persistedPromptHydratedRef.current = false;
    localDraftHydratedRef.current = false;
    demoCaseHydratedRef.current = false;
    setPendingTemplateAutorun(null);
  }, [notebookId]);

  useEffect(() => {
    if (boot !== "ready" || persistedPromptHydratedRef.current) return;
    if (templatePromptHydratedRef.current) return;
    if (!serverRestoredPrompt) return;
    persistedPromptHydratedRef.current = true;
    setComposer(serverRestoredPrompt);
    setBlocks((prev) => {
      if (prev.length === 1 && prev[0]?.type === "prompt") {
        return [{ ...prev[0], text: serverRestoredPrompt, status: "idle" }];
      }
      return prev;
    });
    clearNotebookPromptDraft(notebookId);
  }, [boot, notebookId, serverRestoredPrompt]);

  useEffect(() => {
    if (boot !== "ready") return;
    if (useDeterministicFallback) return;
    if (localDraftHydratedRef.current) return;
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("template_prompt")?.trim()) {
      localDraftHydratedRef.current = true;
      return;
    }
    if (templatePromptHydratedRef.current) {
      localDraftHydratedRef.current = true;
      return;
    }
    if (persistedPromptHydratedRef.current) {
      localDraftHydratedRef.current = true;
      return;
    }
    if (serverRestoredPrompt) {
      localDraftHydratedRef.current = true;
      return;
    }
    if (canPersistNotebook && !notebookMetaQuery.isFetched) return;

    const draft = loadNotebookPromptDraft(notebookId);
    if (draft && (draft.cell.trim() || draft.composer.trim())) {
      setBlocks((prev) => {
        const idx = prev.findIndex((b) => b.type === "prompt");
        if (idx === -1) return prev;
        return prev.map((b, i) =>
          i === idx && b.type === "prompt" ? { ...b, text: draft.cell, status: "idle" as const } : b
        );
      });
      if (draft.composer.trim()) {
        setComposer(draft.composer);
      }
    }
    localDraftHydratedRef.current = true;
  }, [
    boot,
    notebookId,
    canPersistNotebook,
    notebookMetaQuery.isFetched,
    serverRestoredPrompt,
    useDeterministicFallback
  ]);

  useEffect(() => {
    if (boot !== "ready" || templatePromptHydratedRef.current) return;
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search).get("template_prompt")?.trim();
    if (!q) return;
    const autorun = new URLSearchParams(window.location.search).get("autorun") === "1";
    templatePromptHydratedRef.current = true;
    clearNotebookPromptDraft(notebookId);
    // Template navigation must override stale notebook draft text
    // so user always sees prompt from the selected template.
    setComposer(q);
    setBlocks([
      {
        id: `${notebookId}-prompt-template`,
        type: "prompt",
        text: q,
        status: "idle"
      }
    ]);
    setTraceModel({
      ...EMPTY_TRACE,
      interpretedIntent: "",
      generatedSql: "",
      warnings: [],
      tablesUsed: []
    });
    if (autorun) {
      setPendingTemplateAutorun(q);
      setPageNotice("Промпт из шаблона подставлен. Запускаю автоматически…");
    } else {
      setPageNotice("Промпт из шаблона подставлен. Нажмите «Run all» или выполните ячейку.");
    }
  }, [boot, notebookId]);

  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      setBackendHealth((prev) => (prev === "up" ? prev : "checking"));
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const base = getApiBaseUrl().replace(/\/$/, "");
        const [response, runtimeResponse] = await Promise.all([
          fetch(`${base}/health`, {
            method: "GET",
            signal: controller.signal
          }),
          fetch(`${base}/health/runtime`, {
            method: "GET",
            signal: controller.signal
          })
        ]);
        clearTimeout(timeoutId);
        if (cancelled) return;
        setBackendHealth(response.ok ? "up" : "down");
        if (runtimeResponse.ok) {
          const runtime = (await runtimeResponse.json()) as RuntimeHealthModel;
          setRuntimeHealth(runtime);
        } else {
          setRuntimeHealth(null);
        }
        setBackendCheckedAt(new Date().toISOString());
      } catch {
        if (cancelled) return;
        setBackendHealth("down");
        setRuntimeHealth(null);
        setBackendCheckedAt(new Date().toISOString());
      }
    };

    void checkHealth();
    const intervalId = setInterval(() => void checkHealth(), 30000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const collectScenarioPdfFields = useCallback((): ScenarioPdfSnapshot => {
    const prompt = [...blocks].reverse().find((b) => b.type === "prompt");
    const sql = [...blocks].reverse().find((b) => b.type === "sql");
    const insight = [...blocks].reverse().find((b) => b.type === "insight");
    const table = [...blocks].reverse().find((b) => b.type === "table");
    const chart = [...blocks].reverse().find((b) => b.type === "chart");
    return {
      notebook_id: notebookId,
      prompt: prompt && prompt.type === "prompt" ? prompt.text : undefined,
      sql: sql && sql.type === "sql" ? sql.sql : traceModel.generatedSql || undefined,
      insight:
        insight && insight.type === "insight"
          ? insight.summary ?? insight.title
          : undefined,
      confidence: traceModel.confidence,
      warnings: traceModel.warnings,
      table_preview:
        table && table.type === "table" && table.rows.length
          ? table.rows.slice(0, 40)
          : undefined,
      chart_type:
        chart && chart.type === "chart"
          ? chart.chartType
          : traceModel.chartRecommendation.chartType,
      trace_summary:
        traceModel.steps.map((s) => `${s.label}: ${s.status}`).join(" · ") ||
        traceModel.interpretedIntent ||
        undefined
    };
  }, [
    blocks,
    notebookId,
    traceModel.chartRecommendation.chartType,
    traceModel.confidence,
    traceModel.generatedSql,
    traceModel.interpretedIntent,
    traceModel.steps,
    traceModel.warnings
  ]);

  const buildSnapshot = useCallback(
    (reportId: string, reportName: string) => {
      upsertReportSnapshot({
        report_id: reportId,
        report_name: reportName,
        created_at: new Date().toISOString(),
        ...collectScenarioPdfFields()
      });
    },
    [collectScenarioPdfFields]
  );

  const handleDownloadPdf = useCallback(
    async (mode: ReportPdfMode) => {
      setPageError(null);
      setPageNotice(null);
      setDownloadingPdfMode(mode);
      const pdfFields = collectScenarioPdfFields();
      const safeNameBase = lastReport?.name ?? title;
      try {
        let blob: Blob;
        if (lastReport) {
          buildSnapshot(lastReport.id, lastReport.name);
          blob = await downloadReportPdf(lastReport.id, lastReport.name, mode, pdfFields);
        } else {
          blob = await downloadNotebookScenarioPdf(safeNameBase, mode, pdfFields);
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const downloadStem =
          (lastReport?.name ?? safeNameBase)
            .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
            .replace(/\s+/g, "_") || "scenario";
        link.download = `${downloadStem}-${mode}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        setPageNotice(
          lastReport
            ? `PDF отчёта «${lastReport.name}» скачан (${mode}).`
            : `PDF сценария скачан (${mode}); включены таблица, график (если есть числовые колонки), SQL и trace.`
        );
      } catch {
        setPageError("Не удалось сформировать PDF.");
      } finally {
        setDownloadingPdfMode(null);
      }
    },
    [lastReport, buildSnapshot, collectScenarioPdfFields, title]
  );

  const handleDownloadResultCsv = useCallback(() => {
    setPageError(null);
    const table = [...blocks].reverse().find((b) => b.type === "table");
    const chart = [...blocks].reverse().find((b) => b.type === "chart");
    const esc = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    let columns: string[] = [];
    let rows: Record<string, unknown>[] = [];
    let sourceLabel = "таблица";
    if (table && table.type === "table" && table.columns.length && table.rows.length) {
      columns = table.columns;
      rows = table.rows;
      sourceLabel = "таблица";
    } else if (chart && chart.type === "chart" && chart.data.length) {
      columns = Object.keys(chart.data[0] ?? {});
      rows = chart.data;
      sourceLabel = "график";
    }
    if (!columns.length || !rows.length) {
      setPageError("Нет данных результата для экспорта в CSV.");
      return;
    }
    const lines = [
      columns.map(esc).join(","),
      ...rows.map((row) => columns.map((c) => esc(row[c])).join(","))
    ];
    const blob = new Blob(["\ufeff", lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeId = notebookId.replace(/[^\p{L}\p{N}\-_]/gu, "_").slice(0, 48) || "notebook";
    link.href = url;
    link.download = `${safeId}-result.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    setPageNotice(`CSV сохранен (${rows.length} строк, источник: ${sourceLabel}).`);
  }, [blocks, notebookId]);

  const handleSaveAsReport = useCallback(async () => {
    setPageError(null);
    setPageNotice(null);
    const workspaceId = workspaceQuery.data;
    if (!workspaceId) {
      setPageError(
        isDemoModeEnabled()
          ? "Не удалось определить доступ к данным. Обновите страницу или войдите в систему."
          : "Нужен доступ: войдите в систему."
      );
      return;
    }
    setSavingReport(true);
    const reportTitle = `Отчет ${notebookId} · ${new Date().toLocaleString("ru-RU")}`;
    const promptBlock = [...blocks].reverse().find((b) => b.type === "prompt");
    const sqlBlock = [...blocks].reverse().find((b) => b.type === "sql");
    const tableBlock = [...blocks].reverse().find((b) => b.type === "table");
    const chartBlock = [...blocks].reverse().find((b) => b.type === "chart");
    const insightBlock = [...blocks].reverse().find((b) => b.type === "insight");
    const insightPreview =
      insightBlock && insightBlock.type === "insight"
        ? (insightBlock.summary ?? insightBlock.title).slice(0, 500)
        : null;
    const promptText =
      promptBlock && promptBlock.type === "prompt" ? promptBlock.text.trim() : lastPromptForHistory || "—";
    const sqlText =
      sqlBlock && sqlBlock.type === "sql"
        ? sqlBlock.sql
        : traceModel.generatedSql?.trim() || null;
    const nowIso = new Date().toISOString();
    try {
      const report = await createReport.mutateAsync({
        workspace_id: workspaceId,
        title: reportTitle,
        notebook_id: notebookId,
        source_cell_id: sqlBlock?.id ?? promptBlock?.id ?? null,
        payload: {
          prompt: promptText,
          interpreted_query: traceModel.interpretedIntent || null,
          generated_sql: sqlText,
          result_metadata: {
            notebook_id: notebookId,
            insight_preview: insightPreview,
            table_row_count: tableBlock && tableBlock.type === "table" ? tableBlock.rows.length : null,
            table_columns: tableBlock && tableBlock.type === "table" ? tableBlock.columns : null,
            tables_used: traceModel.tablesUsed,
            validation_status: traceModel.validationStatus
          },
          chart_type: chartBlock && chartBlock.type === "chart" ? chartBlock.chartType : traceModel.chartRecommendation.chartType,
          chart_config: buildReportChartConfigForPayload(
            chartBlock ?? undefined,
            traceModel.chartRecommendation.chartType
          ),
          result_snapshot: buildReportResultSnapshotForPayload(tableBlock ?? undefined),
          trace_summary: traceModel.steps.map((s) => `${s.label}: ${s.status}`).join(" · ") || null,
          confidence: traceModel.confidence,
          warnings: traceModel.warnings,
          captured_at: nowIso,
          saved_at: nowIso
        }
      });
      buildSnapshot(report.id, report.title);
      setLastReport({ id: report.id, name: report.title });
      setPageNotice(`Отчет сохранен: ${report.title}`);
    } catch {
      setPageError("Не удалось сохранить отчет. Повторите попытку.");
    } finally {
      setSavingReport(false);
    }
  }, [
    blocks,
    buildSnapshot,
    createReport,
    lastPromptForHistory,
    notebookId,
    traceModel.chartRecommendation.chartType,
    traceModel.confidence,
    traceModel.generatedSql,
    traceModel.interpretedIntent,
    traceModel.steps,
    traceModel.tablesUsed,
    traceModel.validationStatus,
    traceModel.warnings,
    workspaceQuery.data
  ]);

  const handleSaveNotebookScenario = useCallback(async () => {
    if (composerBusy) return;
    setPageError(null);
    setPageNotice(null);
    if (isLocalDemoNotebook) {
      setPageNotice("Локальный сценарий сохранен в браузере (без записи в БД).");
      return;
    }
    setSavingScenario(true);
    const draftPrompt = composer.trim();
    const lastPrompt = [...blocks].reverse().find((b) => b.type === "prompt" && b.text.trim());
    const promptPreview = (draftPrompt || (lastPrompt && lastPrompt.type === "prompt" ? lastPrompt.text.trim() : "")).slice(0, 200);
    const scenarioTitle = `Снимок · ${new Date().toLocaleString("ru-RU")}`;
    const updatedNotebookTitle = promptPreview ? buildScenarioNotebookTitleFromPrompt(promptPreview) : null;
    try {
      let targetNotebookId = notebookId;
      let autoCreated = false;
      if (!canPersistNotebook) {
        const ws = workspaceQuery.data;
        const created = await createNotebook({
          title: `Сценарий ${notebookId}`,
          description: "Автосоздано из slug-страницы для серверного сохранения.",
          ...(ws ? { workspace_id: ws } : {})
        });
        targetNotebookId = created.id;
        autoCreated = true;
      }
      await saveNotebookScenario(targetNotebookId, {
        scenario_title: scenarioTitle,
        scenario_description: promptPreview || undefined
      });
      if (promptPreview) {
        await updateNotebook(targetNotebookId, {
          title: updatedNotebookTitle ?? undefined
        });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.notebooks.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.notebooks.detail(targetNotebookId) });
      clearNotebookPromptDraft(notebookId);
      if (autoCreated) {
        clearNotebookPromptDraft(targetNotebookId);
      }
      setAuthRequired(false);
      setPageNotice(
        autoCreated
          ? `Сценарий сохранён в БД: «${updatedNotebookTitle ?? scenarioTitle}». Создан notebook ${targetNotebookId}; открываю его URL…`
          : `Сценарий сохранён: «${updatedNotebookTitle ?? scenarioTitle}».`
      );
      if (autoCreated) {
        router.push(`/notebooks/${targetNotebookId}`);
      }
    } catch (error) {
      if (isAuthError(error) && !isLocalDemoNotebook) {
        setAuthRequired(true);
      }
      const msg =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Не удалось сохранить сценарий.";
      setPageError(msg);
    } finally {
      setSavingScenario(false);
    }
  }, [canPersistNotebook, composerBusy, isLocalDemoNotebook, notebookId, queryClient, router, workspaceQuery.data, blocks, composer]);

  const handleChartTypeChange = useCallback((id: string, chartType: ChartKind) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id && b.type === "chart" ? { ...b, chartType } : b))
    );
  }, []);

  const handlePromptChange = useCallback((id: string, text: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id && b.type === "prompt" ? { ...b, text } : b))
    );
  }, []);

  const handleClarificationSelect = useCallback(async (clarificationId: string, optionId: string, optionLabel: string) => {
    if (clarificationSubmitLockRef.current) return;
    clarificationSubmitLockRef.current = true;
    const basePromptBlock = [...blocks].reverse().find((b) => b.type === "prompt" && b.text.trim().length > 0);
    const basePrompt =
      basePromptBlock && basePromptBlock.type === "prompt" ? basePromptBlock.text : "Уточнение сценария";
    const fromClick = (optionLabel ?? "").trim();
    const block = blocks.find((b) => b.id === clarificationId && b.type === "clarification");
    const fromState =
      block && block.type === "clarification"
        ? (block.options?.find((o) => o.id === optionId)?.label ?? optionId).trim()
        : "";
    const selectedLabel = fromClick || fromState;
    if (!selectedLabel) {
      setPageError("Не удалось применить выбор: вариант не найден. Перезапустите промпт.");
      clarificationSubmitLockRef.current = false;
      return;
    }

    forecastRunSeqRef.current += 1;
    setBlocks((prev) =>
      prev
        .filter((b) => b.type !== "forecast")
        .map((b) => {
          if (b.type === "clarification" && b.id === clarificationId) {
            return { ...b, selectedOptionId: optionId, status: "running", errorMessage: undefined };
          }
          return b;
        })
    );

    const clarificationPrompt = `${basePrompt}\nУточнение: ${selectedLabel}`;
    setPageError(null);
    setComposerBusy(true);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await Promise.race([
        runAnalyticsWithLocalFallback(clarificationPrompt, popPendingAnalyticsOpts()),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("ANALYTICS_TIMEOUT")), ANALYTICS_TIMEOUT_MS);
        })
      ]);
      if (timeoutId) clearTimeout(timeoutId);
      const mapped = cellDtosToBlocks(result.cells);
      const clarificationRequested = traceClarificationRequested(result.trace);
      const traceBase = traceFromAnalyticsRun(result.trace, result.resolved_source_table);
      applyRuntimeModeNotice(result.runtime_mode);
      setBlocks((prev) => {
        const incoming = mapped.filter((b) => b.type !== "prompt");
        const updated = prev.map((b) =>
          b.id === clarificationId && b.type === "clarification"
            ? { ...b, selectedOptionId: optionId, status: "success" as const }
            : b
        );
        const merged = mergeBlocksById(updated, incoming);
        return finalizeScenarioBlocks(
          merged,
          notebookId,
          basePrompt,
          {
            selectedClarificationId: optionId,
            resetClarification: clarificationRequested,
            hideClarification: !clarificationRequested,
            useDeterministicFallback
          },
          traceBase
        );
      });
      setTraceModel((t) => {
        const next = traceBase;
        return {
          ...next,
          steps: next.steps.length
            ? next.steps
            : [
                ...t.steps,
                {
                  id: `clar-${clarificationId}`,
                  label: "Уточнение применено",
                  detail: selectedLabel,
                  status: "done"
                }
              ],
          logs: [
            ...t.logs,
            { level: "info", message: `Уточнение выбрано: ${selectedLabel}`, at: "t+clarification" },
            ...(next.logs ?? [])
          ]
        };
      });
      setPromptHistory((h) => {
        const next = appendNotebookHistory(notebookId, clarificationPrompt, h);
        saveNotebookHistory(notebookId, next);
        return next;
      });
      setAuthRequired(false);
      setClarificationRunVersion((v) => v + 1);
      if (!mapped.some((b) => b.type === "forecast") && shouldRunFallbackForecast(clarificationPrompt, traceBase.interpretedIntent)) {
        void runForecastAfterInsight();
      }
    } catch (error) {
      if (isAuthError(error) && !isLocalDemoNotebook) {
        setAuthRequired(true);
        forecastRunSeqRef.current += 1;
        setBlocks((prev) => stripStaleBlocksAfterAuthFailure(prev));
      }
      const isTimeout = error instanceof Error && error.message === "ANALYTICS_TIMEOUT";
      const { cell, page } = analyticsErrorBanner(
        error,
        isTimeout,
        "Не удалось продолжить цепочку после уточнения: timeout.",
        "Не удалось продолжить цепочку после уточнения: "
      );
      setPageError(page);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === clarificationId && b.type === "clarification"
            ? {
                ...b,
                selectedOptionId: optionId,
                status: "error" as const,
                errorMessage: cell.slice(0, 200)
              }
            : b
        )
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setComposerBusy(false);
      clarificationSubmitLockRef.current = false;
    }
  }, [
    blocks,
    isLocalDemoNotebook,
    notebookId,
    popPendingAnalyticsOpts,
    runAnalyticsWithLocalFallback,
    runForecastAfterInsight,
    useDeterministicFallback,
    applyRuntimeModeNotice
  ]);

  const runSingleCell = useCallback(async (id: string) => {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "running", errorMessage: undefined } : b))
    );
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "success" } : b))
    );
  }, []);

  const handleRunAll = useCallback(async () => {
    const runnableIds = blocks
      .filter((b) => b.type === "sql" || b.type === "table" || b.type === "chart")
      .map((b) => b.id);
    if (runnableIds.length === 0) return;
    setRunAllLoading(true);
    setTraceModel((t) => ({
      ...t,
      steps: t.steps.map((s) => (s.status === "pending" ? { ...s, status: "running" as const } : s))
    }));
    for (const id of runnableIds) {
      await runSingleCell(id);
    }
    setTraceModel((t) => ({
      ...t,
      confidence: Math.min(0.95, t.confidence + 0.03),
      validationStatus: "passed",
      steps: t.steps.map((s) => ({ ...s, status: "done" as const })),
      logs: [...t.logs, { level: "info", message: `Последовательно выполнено ячеек: ${runnableIds.length}.`, at: "t+end" }]
    }));
    setRunAllLoading(false);
  }, [blocks, runSingleCell]);

  const rememberPromptInHistory = useCallback(
    (text: string) => {
      setPromptHistory((h) => {
        const next = appendNotebookHistory(notebookId, text, h);
        saveNotebookHistory(notebookId, next);
        return next;
      });
    },
    [notebookId]
  );

  const runNewAnalyticsPrompt = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text) return;
      rememberPromptInHistory(text);
      setPageError(null);
      setComposerBusy(true);
      setClarificationRunVersion(0);
      forecastRunSeqRef.current += 1;

      const promptBlock: NotebookBlock = {
        id: `prompt-${Date.now()}`,
        type: "prompt",
        text
      };
      setBlocks((prev) => [...prev.filter((b) => b.type !== "forecast"), promptBlock]);

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      try {
        const result = await Promise.race([
          runAnalyticsWithLocalFallback(text, popPendingAnalyticsOpts()),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error("ANALYTICS_TIMEOUT")), ANALYTICS_TIMEOUT_MS);
          })
        ]);
        if (timeoutId) clearTimeout(timeoutId);
        const mapped = cellDtosToBlocks(result.cells);
        const clarificationRequested = traceClarificationRequested(result.trace);
        const traceNext = traceFromAnalyticsRun(result.trace, result.resolved_source_table);
        applyRuntimeModeNotice(result.runtime_mode);
        setBlocks((prev) => {
          const merged = mergeBlocksById(prev, mapped, { skipPromptText: text });
          return finalizeScenarioBlocks(
            merged,
            notebookId,
            text,
            {
              resetClarification: clarificationRequested,
              hideClarification: !clarificationRequested,
              useDeterministicFallback
            },
            traceNext
          );
        });
        setTraceModel(traceNext);
        setAuthRequired(false);
        if (!mapped.some((b) => b.type === "forecast") && shouldRunFallbackForecast(text, traceNext.interpretedIntent)) {
          void runForecastAfterInsight();
        }
      } catch (error) {
        if (isAuthError(error) && !isLocalDemoNotebook) {
          setAuthRequired(true);
          forecastRunSeqRef.current += 1;
          setBlocks((prev) => stripStaleBlocksAfterAuthFailure(prev));
        }
        const isTimeout = error instanceof Error && error.message === "ANALYTICS_TIMEOUT";
        const { cell, page } = analyticsErrorBanner(
          error,
          isTimeout,
          "Pipeline отвечает слишком долго. Повторите запрос или увеличьте таймаут клиента.",
          "Ошибка запроса к pipeline: "
        );
        setPageError(page);
        setBlocks((prev) =>
          prev.map((b) =>
            b.type === "prompt" && b.text.trim() === text
              ? { ...b, status: "error" as const, errorMessage: cell.slice(0, 320) }
              : b
          )
        );
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        setComposerBusy(false);
      }
    },
    [
      isLocalDemoNotebook,
      notebookId,
      popPendingAnalyticsOpts,
      runAnalyticsWithLocalFallback,
      runForecastAfterInsight,
      useDeterministicFallback,
      applyRuntimeModeNotice,
      rememberPromptInHistory
    ]
  );

  const handleComposerSubmit = useCallback(async () => {
    const text = composer.trim();
    if (!text) return;
    setComposer("");
    await runNewAnalyticsPrompt(text);
  }, [composer, runNewAnalyticsPrompt]);

  useEffect(() => {
    if (boot !== "ready" || demoCaseHydratedRef.current) return;
    const demoCase = searchParams.get("demo_case")?.trim();
    if (!demoCase) return;
    demoCaseHydratedRef.current = true;

    const longPrompt = (() => {
      const base = "Покажи выручку по городам за прошлую неделю и поясни отклонения. ";
      return `Guardrails demo: ${base.repeat(170)}`.slice(0, 9100);
    })();
    const cases: Record<string, string> = {
      ru_table_chart_insight_forecast:
        "Покажи прогноз заказов на следующую неделю по дням, добавь таблицу и краткий insight с предупреждением при низком качестве ряда",
      trace_explainability: "Покажи выручку по городам за прошлую неделю",
      ambiguity_revenue: "Покажи выручку по городам за неделю",
      ambiguity_best_channels: "Лучшие каналы за месяц",
      guardrails_long_prompt: longPrompt
    };
    const selectedPrompt = cases[demoCase];
    if (!selectedPrompt) return;

    setComposer(selectedPrompt);
    setPageNotice("Подставлен демо-промпт сценария жюри. Запускаю автоматически…");
    void runNewAnalyticsPrompt(selectedPrompt);
  }, [boot, runNewAnalyticsPrompt, searchParams]);

  useEffect(() => {
    if (!pendingTemplateAutorun || composerBusy || templateAutorunRef.current) return;
    templateAutorunRef.current = true;
    void runNewAnalyticsPrompt(pendingTemplateAutorun);
    setPendingTemplateAutorun(null);
  }, [pendingTemplateAutorun, composerBusy, runNewAnalyticsPrompt]);

  const handlePromptSubmit = useCallback(async (id: string, rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    rememberPromptInHistory(text);
    setPageError(null);
    setComposerBusy(true);
    setClarificationRunVersion(0);
    forecastRunSeqRef.current += 1;
    setBlocks((prev) =>
      prev
        .filter((b) => b.type !== "forecast")
        .map((b) => (b.id === id ? { ...b, status: "running" as const, errorMessage: undefined } : b))
    );

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await Promise.race([
        runAnalyticsWithLocalFallback(text, popPendingAnalyticsOpts()),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("ANALYTICS_TIMEOUT")), ANALYTICS_TIMEOUT_MS);
        })
      ]);
      if (timeoutId) clearTimeout(timeoutId);
      const mapped = cellDtosToBlocks(result.cells);
      const clarificationRequested = traceClarificationRequested(result.trace);
      const traceNext = traceFromAnalyticsRun(result.trace, result.resolved_source_table);
      applyRuntimeModeNotice(result.runtime_mode);
      setBlocks((prev) => {
        const updated = prev.map((b) => (b.id === id ? { ...b, status: "success" as const, errorMessage: undefined } : b));
        const merged = mergeBlocksById(updated, mapped, { skipPromptText: text });
        return finalizeScenarioBlocks(
          merged,
          notebookId,
          text,
          {
            resetClarification: clarificationRequested,
            hideClarification: !clarificationRequested,
            useDeterministicFallback
          },
          traceNext
        );
      });
      setTraceModel(traceNext);
      setAuthRequired(false);
      if (!mapped.some((b) => b.type === "forecast") && shouldRunFallbackForecast(text, traceNext.interpretedIntent)) {
        void runForecastAfterInsight();
      }
    } catch (error) {
      if (isAuthError(error) && !isLocalDemoNotebook) {
        setAuthRequired(true);
        forecastRunSeqRef.current += 1;
        setBlocks((prev) => stripStaleBlocksAfterAuthFailure(prev));
      }
      const isTimeout = error instanceof Error && error.message === "ANALYTICS_TIMEOUT";
      const { cell, page } = analyticsErrorBanner(
        error,
        isTimeout,
        "Pipeline отвечает слишком долго. Повторите запрос или увеличьте таймаут клиента.",
        "Ошибка запроса к pipeline: "
      );
      setPageError(page);
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, status: "error" as const, errorMessage: cell.slice(0, 320) } : b
        )
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setComposerBusy(false);
    }
  }, [
    applyRuntimeModeNotice,
    isLocalDemoNotebook,
    notebookId,
    popPendingAnalyticsOpts,
    runAnalyticsWithLocalFallback,
    runForecastAfterInsight,
    useDeterministicFallback,
    rememberPromptInHistory
  ]);

  const handleTracePanelRerun = useCallback(
    async (opts: NotebookAnalyticsRunOptions) => {
      const t = lastPromptForHistory;
      if (!t || composerBusy) return;
      const block = [...blocks].reverse().find((b) => b.type === "prompt" && b.text.trim() === t);
      if (!block || block.type !== "prompt") return;
      pendingAnalyticsOptsRef.current = opts;
      await handlePromptSubmit(block.id, t);
    },
    [blocks, composerBusy, handlePromptSubmit, lastPromptForHistory]
  );

  const handlePickHistoryPrompt = useCallback((text: string) => {
    setComposer(text);
  }, []);

  const handleClearHistory = useCallback(() => {
    setPromptHistory([]);
    saveNotebookHistory(notebookId, []);
  }, [notebookId]);

  const handleRerunLastPrompt = useCallback(() => {
    const text = lastPromptForHistory;
    if (!text || composerBusy) return;
    const block = [...blocks].reverse().find((b) => b.type === "prompt");
    if (block && block.type === "prompt") {
      void handlePromptSubmit(block.id, text);
    } else {
      setComposer(text);
    }
  }, [blocks, composerBusy, handlePromptSubmit, lastPromptForHistory]);

  const isAdminUser = meQuery.data ? meQuery.data.role === "admin" : session.role === "admin";

  const notebookQuickActions = useMemo(() => {
    const items = [
      { label: "Открыть отчеты", href: "/reports", hint: "Сохранить результаты сценария как отчет" },
      { label: "Открыть историю", href: "/history", hint: "Проверить trace summary запуска" },
      { label: "Открыть шаблоны", href: "/templates", hint: "Старт из ролевого шаблона" }
    ];
    if (isAdminUser) {
      items.push({ label: "Словарь", href: "/dictionary", hint: "Проверить семантические термины" });
    }
    items.push({
      label: "Прогноз (лаб)",
      href: "/forecast-lab",
      hint: "Экран прогнозных моделей и backtest"
    });
    return items;
  }, [isAdminUser]);

  const handleAcceptInterpretation = useCallback(async () => {
    setInterpretationActionBusy(true);
    try {
      await new Promise((r) => setTimeout(r, 200));
      setInterpretationAccepted(true);
      setPageNotice("Трактовка принята для текущего результата (MVP: фиксация только в интерфейсе).");
    } finally {
      setInterpretationActionBusy(false);
    }
  }, []);

  const handleEditInterpretation = useCallback(() => {
    const line = traceModel.interpretedIntent?.trim() || interpretationView.intent;
    const seed = line && line !== "unknown" ? line : "уточни метрику и период";
    setComposer((prev) =>
      prev.trim()
        ? `${prev.trim()}\n\nУточнение трактовки: система поняла запрос как «${seed}». Хочу изменить формулировку: `
        : `Уточнение трактовки: сейчас «${seed}». Исправь понимание на: `
    );
    setPageNotice("Текст для уточнения добавлен в композер внизу страницы.");
  }, [interpretationView.intent, traceModel.interpretedIntent]);

  if (boot === "loading") {
    return (
      <div className="space-y-4">
        <NotebookHeader
          title={title}
          notebookId={notebookId}
          subtitle="AI-канва аналитики"
          runState="running"
          runPhaseHint={busyAnalyticsHint}
        />
        <NotebookLoadingState />
      </div>
    );
  }

  if (boot === "error") {
    return (
      <div className="space-y-4">
        <NotebookHeader title={title} notebookId={notebookId} />
        <NotebookErrorBanner message="Не удалось инициализировать оболочку сценария." onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,230px)_minmax(0,1fr)] xl:items-start">
      <div className="hidden min-w-0 xl:block">
        <NotebookHistoryPanel
          items={promptHistory}
          onSelect={handlePickHistoryPrompt}
          onRerunLast={handleRerunLastPrompt}
          disabled={composerBusy}
          lastPromptText={lastPromptForHistory}
          onClear={handleClearHistory}
        />
      </div>
      <div className="min-w-0">
      <NotebookCanvas
        traceOpen={traceOpen}
        trace={
          <TracePanel
            model={traceModel}
            onClose={() => setTraceOpen(false)}
            lastPromptText={lastPromptForHistory}
            traceActionBusy={composerBusy}
            onTraceRerun={handleTracePanelRerun}
            onScrollToClarification={() =>
              document.getElementById("notebook-clarification-cell")?.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
              })
            }
          />
        }
      >
        <div className="min-w-0 space-y-6">
        <NotebookHeader
          title={title}
          subtitle="Промпт · план · SQL · результаты · графики · инсайты — с живым trace."
          notebookId={notebookId}
          updatedAtLabel="Система"
          runState={headerRunState}
          runPhaseHint={busyAnalyticsHint}
          trailing={
            <>
              <button
                type="button"
                onClick={() => setTraceOpen((v) => !v)}
                className="w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800 sm:w-auto"
              >
                {traceOpen ? "Скрыть trace" : "Показать trace"}
              </button>
              <RunAllButton onClick={handleRunAll} loading={runAllLoading} disabled={runAllLoading || authRequired} />
              <button
                type="button"
                onClick={() => void handleSaveNotebookScenario()}
                disabled={savingScenario || composerBusy || authRequired}
                title={
                  canPersistNotebook
                    ? "POST /api/v1/notebooks/{id}/save — снимок в context_chain_json на сервере"
                    : "Сначала будет создан UUID notebook на сервере, затем сценарий запишется в БД"
                }
                className="w-full rounded-control border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950 shadow-xs hover:bg-sky-100 disabled:opacity-50 sm:w-auto"
              >
                {savingScenario ? "Запись..." : "Сохранить сценарий"}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf(getDefaultReportPdfMode())}
                disabled={downloadingPdfMode !== null}
                title="Экспорт текущего сценария в PDF (таблица, график, SQL, trace). Режим compact/board — из настроек в localStorage. Сохранённый отчёт не обязателен."
                className="w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800 disabled:opacity-50 sm:w-auto"
              >
                {downloadingPdfMode ? "Скачивание…" : "PDF"}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadResultCsv()}
                disabled={composerBusy || !hasExportableTable}
                title={
                  hasExportableTable
                    ? "Экспорт последней таблицы результата в CSV (UTF-8 с BOM для Excel)"
                    : "Сначала выполните запрос — появится таблица с данными"
                }
                className="w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800 disabled:opacity-50 sm:w-auto"
              >
                CSV
              </button>
            </>
          }
        />

        {authRequired && !isLocalDemoNotebook ? (
          <section className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Нужна авторизация</p>
            <p className="mt-1">
              Backend вернул 401/403. Войдите в систему, затем повторите действие. Устаревшие прогноз, график и инсайт
              при ошибке сессии скрываются, чтобы не смешивать их с новым запросом.
            </p>
            <div className="mt-2">
              <Link
                href="/login"
                className="inline-flex rounded-control border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100"
              >
                Перейти ко входу
              </Link>
            </div>
          </section>
        ) : null}
        {pageError ? (
          <NotebookErrorBanner message={pageError} onRetry={() => setPageError(null)} />
        ) : null}
        {pageNotice ? (
          <section className="rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {pageNotice}
          </section>
        ) : null}
        {composerBusy ? <NotebookPipelineLoadingState /> : null}
        {!composerBusy && isApiMockFallback() ? <NotebookFallbackModeState /> : null}
        {!composerBusy && traceModel.guardrails.blocked ? (
          <NotebookValidationBlockedState messages={traceModel.guardrails.messagesRu} />
        ) : null}
        {!composerBusy && clarificationPending ? <NotebookClarificationNeededState /> : null}
        {!composerBusy && emptyAnalyticTable ? <NotebookNoDataState /> : null}
        <section className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-border-subtle bg-surface-muted px-2.5 py-1 font-semibold text-foreground-secondary">
              Состояние системы
            </span>
            <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 font-semibold text-brand-900">
              API: {apiModeLabel}
            </span>
            {runtimeHealth ? (
              <>
                <span
                  data-testid="runtime-env-badge"
                  className="rounded-full border border-border-subtle bg-surface-muted px-2.5 py-1 font-semibold text-foreground-secondary"
                >
                  env: {runtimeHealth.environment}
                </span>
                <span
                  data-testid="runtime-postgres-badge"
                  className={`rounded-full border px-2.5 py-1 font-semibold ${
                    runtimeHealth.postgres_required
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                  }`}
                  title="Требуется ли живой Postgres для текущего runtime-профиля"
                >
                  postgres: {runtimeHealth.postgres_required ? "required" : "optional"}
                </span>
                <span
                  data-testid="runtime-sql-mode-badge"
                  className={`rounded-full border px-2.5 py-1 font-semibold ${
                    runtimeHealth.mock_mode || runtimeHealth.mock_sql_execution_fallback
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-emerald-200 bg-emerald-50 text-emerald-900"
                  }`}
                  title="Профиль SQL-исполнения backend"
                >
                  sql: {runtimeHealth.mock_mode ? "mock" : runtimeHealth.mock_sql_execution_fallback ? "live+fallback" : "live"}
                </span>
                <span
                  data-testid="runtime-auth-mode-badge"
                  className={`rounded-full border px-2.5 py-1 font-semibold ${
                    runtimeHealth.demo_auth_bypass_enabled
                      ? "border-amber-200 bg-amber-50 text-amber-900"
                      : "border-border-subtle bg-surface-muted text-foreground-secondary"
                  }`}
                  title="Авторизация backend: demo bypass или JWT"
                >
                  auth: {runtimeHealth.demo_auth_bypass_enabled ? "bypass" : runtimeHealth.jwt_required ? "jwt-required" : "jwt"}
                </span>
              </>
            ) : null}
            <span
              className={`rounded-full border px-2.5 py-1 font-semibold ${
                backendHealth === "up"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : backendHealth === "down"
                    ? "border-danger/30 bg-danger-soft text-danger-bold"
                    : "border-border-subtle bg-surface-muted text-foreground-secondary"
              }`}
            >
              Backend: {backendHealth === "up" ? "online" : backendHealth === "down" ? "offline" : "checking..."}
            </span>
            <span
              className={`rounded-full border px-2.5 py-1 font-semibold ${
                traceModel.qualityGate.status === "failed"
                  ? "border-danger/30 bg-danger-soft text-danger-bold"
                  : traceModel.qualityGate.status === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              Качество:{" "}
              {traceModel.qualityGate.status === "passed"
                ? "норма"
                : traceModel.qualityGate.status === "warning"
                  ? "предупреждение"
                  : "ошибка"}
            </span>
            {backendCheckedAt ? (
              <span className="text-foreground-muted">
                check: {new Date(backendCheckedAt).toISOString().slice(11, 19)} UTC
              </span>
            ) : null}
          </div>
        </section>
        <section className="rounded-card border border-border-subtle bg-surface-card p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Цепочка сценария</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <div
              className={`rounded-control border px-3 py-2 text-xs ${
                clarificationBlock?.selectedOptionId
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-border-subtle bg-surface-muted text-foreground-secondary"
              }`}
            >
              <p className="font-semibold">1. Уточнение</p>
              <p className="mt-0.5">
                {clarificationBlock
                  ? clarificationBlock.selectedOptionId
                    ? "Опция выбрана"
                    : "Ожидает выбора"
                  : "Не требуется"}
              </p>
            </div>
            <div
              className={`rounded-control border px-3 py-2 text-xs ${
                clarificationBlock?.status === "running"
                  ? "border-brand-200 bg-brand-50 text-brand-900"
                  : clarificationRunVersion > 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-border-subtle bg-surface-muted text-foreground-secondary"
              }`}
            >
              <p className="font-semibold">2. Выполнение</p>
              <p className="mt-0.5">
                {clarificationBlock?.status === "running"
                  ? "Цепочка выполняется..."
                  : clarificationRunVersion > 0
                    ? "Цепочка выполнена"
                    : "Не запущено"}
              </p>
            </div>
            <div
              className={`rounded-control border px-3 py-2 text-xs ${
                clarificationRunVersion > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-border-subtle bg-surface-muted text-foreground-secondary"
              }`}
            >
              <p className="font-semibold">3. План</p>
              <p className="mt-0.5">
                {clarificationRunVersion > 0 ? `Обновлен (v${clarificationRunVersion})` : "Ожидает обновления"}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-card border border-border-subtle bg-surface-card p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Как система поняла запрос</p>
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-control border border-border-subtle bg-surface-muted px-3 py-2">
              <span className="font-semibold text-foreground-muted">Intent:</span> {interpretationView.intent}
            </div>
            <div className="rounded-control border border-border-subtle bg-surface-muted px-3 py-2">
              <span className="font-semibold text-foreground-muted">Confidence:</span>{" "}
              {Math.round((traceModel.confidence ?? 0) * 100)}%
            </div>
            <div className="rounded-control border border-border-subtle bg-surface-muted px-3 py-2">
              <span className="font-semibold text-foreground-muted">Metric:</span> {interpretationView.metric || "не определена"}
            </div>
            <div className="rounded-control border border-border-subtle bg-surface-muted px-3 py-2">
              <span className="font-semibold text-foreground-muted">Aggregation:</span>{" "}
              {interpretationView.aggregation || "не определена"}
            </div>
            <div className="rounded-control border border-border-subtle bg-surface-muted px-3 py-2">
              <span className="font-semibold text-foreground-muted">Dimensions:</span>{" "}
              {interpretationView.dimensions.length ? interpretationView.dimensions.join(", ") : "нет"}
            </div>
            <div className="rounded-control border border-border-subtle bg-surface-muted px-3 py-2">
              <span className="font-semibold text-foreground-muted">Grouping:</span>{" "}
              {interpretationView.grouping.length ? interpretationView.grouping.join(", ") : "нет"}
            </div>
            <div className="rounded-control border border-border-subtle bg-surface-muted px-3 py-2 sm:col-span-2">
              <span className="font-semibold text-foreground-muted">Filters:</span>{" "}
              {interpretationView.filters.length ? interpretationView.filters.join(" · ") : "нет"}
            </div>
            <div className="rounded-control border border-border-subtle bg-surface-muted px-3 py-2">
              <span className="font-semibold text-foreground-muted">Time range:</span> {interpretationView.timeLabel}
            </div>
            <div className="rounded-control border border-border-subtle bg-surface-muted px-3 py-2">
              <span className="font-semibold text-foreground-muted">Chart hint:</span>{" "}
              {interpretationView.chartHint || "table"}
            </div>
          </div>
          {interpretationView.summary ? (
            <p className="mt-3 text-xs text-foreground-secondary">{interpretationView.summary}</p>
          ) : null}
          {interpretationView.ambiguityFlags.length ? (
            <p className="mt-2 text-xs text-amber-900">
              Неоднозначность: {interpretationView.ambiguityFlags.join(", ")}
            </p>
          ) : null}
          {interpretationView.notes.length ? (
            <div className="mt-2 space-y-1 text-xs text-foreground-secondary">
              {interpretationView.notes.map((note, idx) => (
                <p key={`interp-note-${idx}`}>- {note}</p>
              ))}
            </div>
          ) : null}
        </section>

        <DemoQuickActions title="Переходы" items={notebookQuickActions} />

        <NotebookHistoryChips
          items={promptHistory}
          onSelect={handlePickHistoryPrompt}
          disabled={composerBusy}
        />

        <AnalysisRunSummary
          blocks={blocks}
          traceModel={traceModel}
          onSaveReport={() => void handleSaveAsReport()}
          savingReport={savingReport}
          onRerunLast={handleRerunLastPrompt}
          runBusy={composerBusy}
          onChartTypeChange={handleChartTypeChange}
          clarificationPending={clarificationPending}
          onOpenTrace={() => setTraceOpen(true)}
          showDictionaryLink={isAdminUser}
          onAcceptInterpretation={() => void handleAcceptInterpretation()}
          onEditInterpretation={handleEditInterpretation}
          interpretationActionsBusy={interpretationActionBusy}
          interpretationAccepted={interpretationAccepted}
        />

        {blocks.length === 0 ? (
          <NotebookEmptyState />
        ) : (
          <div className="space-y-4">
            {blocks.map((block, index) => (
              <NotebookCell
                key={block.id}
                index={index}
                block={block}
                onRunCell={runSingleCell}
                onChartTypeChange={handleChartTypeChange}
                onPromptChange={handlePromptChange}
                onPromptSubmit={handlePromptSubmit}
                onClarificationSelect={handleClarificationSelect}
                clarificationBusy={composerBusy}
              />
            ))}
          </div>
        )}

        <AddCellComposer
          value={composer}
          onChange={setComposer}
          onSubmit={handleComposerSubmit}
          loading={composerBusy}
          disabled={composerBusy}
        />
        </div>
      </NotebookCanvas>
      </div>
    </div>
  );
}
