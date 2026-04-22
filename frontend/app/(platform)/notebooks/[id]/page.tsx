"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AddCellComposer } from "@/components/notebook/add-cell-composer";
import { RunAllButton } from "@/components/notebook/run-all-button";
import { NotebookCanvas } from "@/components/notebook/notebook-canvas";
import { NotebookCell } from "@/components/notebook/notebook-cell";
import { NotebookHeader } from "@/components/notebook/notebook-header";
import {
  NotebookEmptyState,
  NotebookErrorBanner,
  NotebookLoadingState
} from "@/components/notebook/notebook-states";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { useCreateReport } from "@/hooks/api/use-reports";
import { downloadReportPdf, type ReportPdfMode } from "@/lib/api/reports";
import { getDefaultReportPdfMode } from "@/lib/preferences/report-pdf";
import { upsertReportSnapshot } from "@/lib/reports/local-snapshots";
import { TracePanel } from "@/components/notebook/trace-panel";
import {
  getApiBaseUrl,
  isApiMockFallback,
  isApiMockOnly,
  runAnalyticsPipeline,
  shouldForceAnalyticsMock
} from "@/lib/api";
import type { ChartKind, NotebookBlock, TracePanelModel } from "@/lib/notebook/block-types";
import { cellDtosToBlocks } from "@/lib/notebook/legacy-map";
import { EMPTY_TRACE, traceFromAnalytics } from "@/lib/notebook/trace-model";
import {
  deterministicSqlTopCancelledCities,
  topCityCancellations,
  topCityLimitFromPrompt
} from "@/lib/demo/seeded-data";

// DeepSeek flow may include several sequential LLM calls in one pipeline run.
// Keep client-side timeout comfortably above a typical multi-call latency.
const ANALYTICS_TIMEOUT_MS = 45000;

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

const CORE_CHAIN_ORDER: NotebookBlock["type"][] = ["clarification", "trace", "sql", "table", "chart", "insight"];

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
  return true;
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
  const lastPrompt =
    [...blocks].reverse().find((b) => b.type === "prompt") ??
    ({ id: `${notebookId}-p1`, type: "prompt", text: promptText } as NotebookBlock);
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
      tables: ["anonymized_incity_orders"]
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
  const notebookId = String(params.id ?? "");

  const [boot, setBoot] = useState<"loading" | "ready" | "error">("loading");
  const [blocks, setBlocks] = useState<NotebookBlock[]>([]);
  const [traceModel, setTraceModel] = useState<TracePanelModel>(EMPTY_TRACE);
  const [traceOpen, setTraceOpen] = useState(true);
  const [composer, setComposer] = useState("");
  const [composerBusy, setComposerBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [runAllLoading, setRunAllLoading] = useState(false);
  const [headerRunState, setHeaderRunState] = useState<"idle" | "running">("idle");
  const [savingReport, setSavingReport] = useState(false);
  const [lastReport, setLastReport] = useState<{ id: string; name: string } | null>(null);
  const [downloadingPdfMode, setDownloadingPdfMode] = useState<ReportPdfMode | null>(null);
  const [clarificationRunVersion, setClarificationRunVersion] = useState(0);
  const [backendHealth, setBackendHealth] = useState<"checking" | "up" | "down">("checking");
  const [backendCheckedAt, setBackendCheckedAt] = useState<string | null>(null);
  const createReport = useCreateReport();
  const useDeterministicFallback = useMemo(
    () => isApiMockOnly() || shouldForceAnalyticsMock(),
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await new Promise((r) => setTimeout(r, 420));
        if (cancelled) return;
        const bootBlocks = buildDemoBlocks(notebookId);
        const bootPrompt = bootBlocks.find((b) => b.type === "prompt")?.text ?? "Сценарий";
        setBlocks(
          stabilizeScenarioBlocks(bootBlocks, notebookId, bootPrompt, {
            resetClarification: true,
            useDeterministicFallback
          })
        );
        setTraceModel({
          ...EMPTY_TRACE,
          confidence: 0.86,
          validationStatus: "passed",
          interpretedIntent: "анализ · revenue_gap_analysis",
          tablesUsed: ["anonymized_incity_orders"],
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
          qualityGate: {
            status: "passed",
            reasons: []
          },
          steps: [
            { id: "s1", label: "Инициализация канвы", detail: "Блоки загружены", status: "done" },
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

  const title = useMemo(() => `Сценарий ${notebookId}`, [notebookId]);
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

  useEffect(() => {
    let cancelled = false;
    const checkHealth = async () => {
      setBackendHealth((prev) => (prev === "up" ? prev : "checking"));
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const response = await fetch(`${getApiBaseUrl().replace(/\/$/, "")}/health`, {
          method: "GET",
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (cancelled) return;
        setBackendHealth(response.ok ? "up" : "down");
        setBackendCheckedAt(new Date().toISOString());
      } catch {
        if (cancelled) return;
        setBackendHealth("down");
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

  const buildSnapshot = useCallback((reportId: string, reportName: string) => {
    const prompt = [...blocks].reverse().find((b) => b.type === "prompt");
    const sql = [...blocks].reverse().find((b) => b.type === "sql");
    const insight = [...blocks].reverse().find((b) => b.type === "insight");
    const table = [...blocks].reverse().find((b) => b.type === "table");
    upsertReportSnapshot({
      report_id: reportId,
      report_name: reportName,
      notebook_id: notebookId,
      prompt: prompt && prompt.type === "prompt" ? prompt.text : undefined,
      sql: sql && sql.type === "sql" ? sql.sql : traceModel.generatedSql || undefined,
      insight:
        insight && insight.type === "insight"
          ? insight.summary ?? insight.title
          : undefined,
      confidence: traceModel.confidence,
      warnings: traceModel.warnings,
      table_preview: table && table.type === "table" ? table.rows.slice(0, 5) : undefined,
      created_at: new Date().toISOString()
    });
  }, [blocks, notebookId, traceModel.confidence, traceModel.generatedSql, traceModel.warnings]);

  const handleDownloadPdf = useCallback(async (mode: ReportPdfMode) => {
    if (!lastReport) return;
    setPageError(null);
    setPageNotice(null);
    setDownloadingPdfMode(mode);
    try {
      const blob = await downloadReportPdf(lastReport.id, lastReport.name, mode);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${lastReport.name.replace(/[^\p{L}\p{N}\-_ ]/gu, "").replace(/\s+/g, "_") || "report"}-${mode}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setPageNotice(`PDF отчета "${lastReport.name}" скачан (${mode}).`);
    } catch {
      setPageError("Не удалось скачать PDF отчета.");
    } finally {
      setDownloadingPdfMode(null);
    }
  }, [lastReport]);

  const handleSaveAsReport = useCallback(async () => {
    setPageError(null);
    setPageNotice(null);
    setSavingReport(true);
    const reportName = `Отчет ${notebookId} · ${new Date().toLocaleString("ru-RU")}`;
    try {
      const report = await createReport.mutateAsync({
        name: reportName,
        format: "pdf",
        notebook_id: notebookId
      });
      buildSnapshot(report.id, report.name);
      setLastReport({ id: report.id, name: report.name });
      setPageNotice(`Отчет сохранен: ${report.name}`);
    } catch {
      setPageError("Не удалось сохранить отчет. Повторите попытку.");
    } finally {
      setSavingReport(false);
    }
  }, [buildSnapshot, createReport, notebookId]);

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

  const handleClarificationSelect = useCallback(async (clarificationId: string, optionId: string) => {
    let selectedLabel = "";
    const basePrompt =
      [...blocks].reverse().find((b) => b.type === "prompt" && b.text.trim().length > 0)?.text ??
      "Уточнение сценария";
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.type === "clarification" && b.id === clarificationId) {
          selectedLabel = b.options?.find((o) => o.id === optionId)?.label ?? optionId;
          return { ...b, selectedOptionId: optionId, status: "running", errorMessage: undefined };
        }
        return b;
      })
    );

    if (!selectedLabel) return;
    const clarificationPrompt = `${basePrompt}\nУточнение: ${selectedLabel}`;
    setPageError(null);
    setComposerBusy(true);
    setHeaderRunState("running");

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await Promise.race([
        runAnalyticsPipeline(notebookId, clarificationPrompt),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("ANALYTICS_TIMEOUT")), ANALYTICS_TIMEOUT_MS);
        })
      ]);
      if (timeoutId) clearTimeout(timeoutId);
      const mapped = cellDtosToBlocks(result.cells);
      const clarificationRequested = Boolean(result.trace?.clarification_requested);
      setBlocks((prev) => {
        const incoming = mapped.filter((b) => b.type !== "prompt");
        const updated = prev.map((b) =>
          b.id === clarificationId && b.type === "clarification"
            ? { ...b, selectedOptionId: optionId, status: "success" as const }
            : b
        );
        const merged = mergeBlocksById(updated, incoming);
        return stabilizeScenarioBlocks(merged, notebookId, basePrompt, {
          selectedClarificationId: optionId,
          hideClarification: !clarificationRequested,
          useDeterministicFallback
        });
      });
      setTraceModel((t) => {
        const next = traceFromAnalytics(result.trace);
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
      setClarificationRunVersion((v) => v + 1);
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === "ANALYTICS_TIMEOUT";
      setPageError(
        isTimeout
          ? "Не удалось продолжить цепочку после уточнения: timeout."
          : "Не удалось продолжить цепочку после уточнения."
      );
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === clarificationId && b.type === "clarification"
            ? {
                ...b,
                selectedOptionId: optionId,
                status: "error" as const,
                errorMessage: "Не удалось применить уточнение."
              }
            : b
        )
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setComposerBusy(false);
      setHeaderRunState("idle");
    }
  }, [blocks, notebookId, useDeterministicFallback]);

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
    setHeaderRunState("running");
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
    setHeaderRunState("idle");
  }, [blocks, runSingleCell]);

  const handleComposerSubmit = useCallback(async () => {
    const text = composer.trim();
    if (!text) return;
    setPageError(null);
    setComposerBusy(true);
    setHeaderRunState("running");
    setClarificationRunVersion(0);

    const promptBlock: NotebookBlock = {
      id: `prompt-${Date.now()}`,
      type: "prompt",
      text
    };
    setBlocks((prev) => [...prev, promptBlock]);
    setComposer("");

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await Promise.race([
        runAnalyticsPipeline(notebookId, text),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("ANALYTICS_TIMEOUT")), ANALYTICS_TIMEOUT_MS);
        })
      ]);
      if (timeoutId) clearTimeout(timeoutId);
      const mapped = cellDtosToBlocks(result.cells);
      const clarificationRequested = Boolean(result.trace?.clarification_requested);
      setBlocks((prev) => {
        // Keep optimistic prompt block and skip exact prompt duplicate by text.
        const merged = mergeBlocksById(prev, mapped, { skipPromptText: text });
        return stabilizeScenarioBlocks(merged, notebookId, text, {
          resetClarification: clarificationRequested,
          hideClarification: !clarificationRequested,
          useDeterministicFallback
        });
      });
      setTraceModel(traceFromAnalytics(result.trace));
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === "ANALYTICS_TIMEOUT";
      setPageError(
        isTimeout
          ? "Pipeline отвечает слишком долго. Показан локальный fallback-инсайт, попробуйте еще раз."
          : "Ошибка запроса к pipeline - показываю локальный fallback-инсайт."
      );
      setBlocks((prev) =>
        prev.map((b) =>
          b.type === "prompt" && b.text.trim() === text
            ? { ...b, status: "error" as const, errorMessage: "Не удалось выполнить промпт." }
            : b
        )
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setComposerBusy(false);
      setHeaderRunState("idle");
    }
  }, [composer, notebookId, useDeterministicFallback]);

  const handlePromptSubmit = useCallback(async (id: string, rawText: string) => {
    const text = rawText.trim();
    if (!text) return;
    setPageError(null);
    setComposerBusy(true);
    setHeaderRunState("running");
    setClarificationRunVersion(0);
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, status: "running" as const, errorMessage: undefined } : b)));

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = await Promise.race([
        runAnalyticsPipeline(notebookId, text),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("ANALYTICS_TIMEOUT")), ANALYTICS_TIMEOUT_MS);
        })
      ]);
      if (timeoutId) clearTimeout(timeoutId);
      const mapped = cellDtosToBlocks(result.cells);
      const clarificationRequested = Boolean(result.trace?.clarification_requested);
      setBlocks((prev) => {
        const updated = prev.map((b) => (b.id === id ? { ...b, status: "success" as const, errorMessage: undefined } : b));
        const merged = mergeBlocksById(updated, mapped, { skipPromptText: text });
        return stabilizeScenarioBlocks(merged, notebookId, text, {
          resetClarification: clarificationRequested,
          hideClarification: !clarificationRequested,
          useDeterministicFallback
        });
      });
      setTraceModel(traceFromAnalytics(result.trace));
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === "ANALYTICS_TIMEOUT";
      setPageError(
        isTimeout
          ? "Pipeline отвечает слишком долго. Показан локальный fallback-инсайт, попробуйте еще раз."
          : "Ошибка запроса к pipeline - показываю локальный fallback-инсайт."
      );
      setBlocks((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: "error" as const, errorMessage: "Не удалось выполнить промпт." } : b))
      );
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setComposerBusy(false);
      setHeaderRunState("idle");
    }
  }, [notebookId, useDeterministicFallback]);

  const presetPrompts = useMemo(
    () => [
      {
        id: "main",
        label: "Main demo",
        text: "Покажи топ-3 города по количеству отменённых заказов на этой неделе"
      },
      {
        id: "clarification",
        label: "Clarification",
        text: "Покажи лучшие города за неделю"
      },
      {
        id: "follow-up",
        label: "Follow-up",
        text: "Покажи отмены по городам за неделю. А теперь только по Москве."
      }
    ],
    []
  );

  if (boot === "loading") {
    return (
      <div className="space-y-4">
        <NotebookHeader title={title} notebookId={notebookId} subtitle="AI-канва аналитики" runState="running" />
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
    <NotebookCanvas
      traceOpen={traceOpen}
      trace={<TracePanel model={traceModel} onClose={() => setTraceOpen(false)} />}
    >
      <div className="space-y-6">
        <NotebookHeader
          title={title}
          subtitle="Промпт · план · SQL · результаты · графики · инсайты — с живым trace."
          notebookId={notebookId}
          updatedAtLabel="Workspace"
          runState={headerRunState}
          trailing={
            <>
              <button
                type="button"
                onClick={() => setTraceOpen((v) => !v)}
                className="w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800 sm:w-auto"
              >
                {traceOpen ? "Скрыть trace" : "Показать trace"}
              </button>
              <RunAllButton onClick={handleRunAll} loading={runAllLoading} disabled={runAllLoading} />
              <button
                type="button"
                onClick={handleSaveAsReport}
                disabled={savingReport}
                className="w-full rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-xs hover:bg-emerald-100 disabled:opacity-60 sm:w-auto"
              >
                {savingReport ? "Сохранение..." : "Сохранить как отчет"}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf(getDefaultReportPdfMode())}
                disabled={!lastReport || downloadingPdfMode !== null}
                className="w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800 disabled:opacity-50 sm:w-auto"
              >
                {downloadingPdfMode ? "Скачивание..." : "PDF по умолчанию"}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf("compact")}
                disabled={!lastReport || downloadingPdfMode !== null}
                className="hidden w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800 disabled:opacity-50 sm:inline-flex sm:w-auto"
              >
                {downloadingPdfMode === "compact" ? "Скачивание..." : "PDF compact"}
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf("board")}
                disabled={!lastReport || downloadingPdfMode !== null}
                className="hidden w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800 disabled:opacity-50 sm:inline-flex sm:w-auto"
              >
                {downloadingPdfMode === "board" ? "Скачивание..." : "PDF board"}
              </button>
            </>
          }
        />

        {pageError ? (
          <NotebookErrorBanner message={pageError} onRetry={() => setPageError(null)} />
        ) : null}
        {pageNotice ? (
          <section className="rounded-card border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {pageNotice}
          </section>
        ) : null}
        <section className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-border-subtle bg-surface-muted px-2.5 py-1 font-semibold text-foreground-secondary">
              Demo Health
            </span>
            <span className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 font-semibold text-brand-900">
              API: {apiModeLabel}
            </span>
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
              Quality: {traceModel.qualityGate.status}
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

        <DemoQuickActions
          title="Переходы"
          items={[
            { label: "Открыть отчеты", href: "/reports", hint: "Сохранить результаты сценария как отчет" },
            { label: "Открыть историю", href: "/history", hint: "Проверить trace summary запуска" },
            { label: "Открыть шаблоны", href: "/templates", hint: "Старт из ролевого шаблона" },
            { label: "Словарь", href: "/dictionary", hint: "Проверить семантические термины" }
          ]}
        />

        <section className="rounded-card border border-border-subtle bg-surface-card p-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Быстрые действия</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {presetPrompts.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={composerBusy}
                onClick={() => setComposer(preset.text)}
                className="rounded-control border border-border-subtle bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground-secondary hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800 disabled:opacity-50"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

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
  );
}
