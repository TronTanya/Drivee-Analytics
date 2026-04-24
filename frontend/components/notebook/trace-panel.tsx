"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useState } from "react";
import type { ChartKind, TracePanelModel } from "@/lib/notebook/block-types";
import type { TracePanelProps } from "@/lib/notebook/block-types";
import type { NotebookAnalyticsRunOptions } from "@/types/api/cells";
import { ConfidenceBadge } from "@/components/notebook/confidence-badge";
import { ValidationBadge } from "@/components/notebook/validation-badge";
import { UiStateSurface } from "@/components/ui/state-surface";
import { clarificationReasonSummaryRu } from "@/lib/notebook/clarification-copy";

const CHART_QUICK_CYCLE: ChartKind[] = ["line", "bar", "table", "horizontal_bar", "area"];

function nextQuickChartKind(current: string): ChartKind {
  const cur = (current || "table") as ChartKind;
  const i = CHART_QUICK_CYCLE.indexOf(cur);
  return CHART_QUICK_CYCLE[(i < 0 ? 0 : i + 1) % CHART_QUICK_CYCLE.length];
}

const stepDot: Record<string, string> = {
  pending: "bg-foreground-muted",
  running: "bg-brand-500 animate-pulse-soft",
  done: "bg-foreground",
  failed: "bg-danger",
  skipped: "bg-border-subtle ring-1 ring-border-subtle"
};

function CollapsibleSection(props: {
  title: string;
  defaultOpen: boolean;
  children: ReactNode;
  muted?: boolean;
}) {
  const { title, defaultOpen, children, muted } = props;
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const panelId = `${id}-panel`;

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <div
      className={`overflow-hidden rounded-control border border-border-subtle ${muted ? "bg-surface-muted/40" : "bg-surface-card"}`}
    >
      <button
        type="button"
        className="interactive-focus flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-foreground transition hover:bg-surface-muted/60"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="w-4 shrink-0 text-[10px] text-foreground-muted" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <span className="uppercase tracking-wide">{title}</span>
      </button>
      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        className={open ? "border-t border-border-subtle px-3 py-2.5 text-sm text-foreground-secondary" : "hidden"}
      >
        {open ? children : null}
      </div>
    </div>
  );
}

function validationDerived(validationStatus: TracePanelProps["model"]["validationStatus"]): {
  ok: boolean;
  hint: string;
} {
  if (validationStatus === "passed") return { ok: true, hint: "Проверено" };
  if (validationStatus === "pending") return { ok: false, hint: "В ожидании" };
  if (validationStatus === "failed") return { ok: false, hint: "Ошибка" };
  return { ok: true, hint: "Не запускалось" };
}

function traceToExportJson(model: TracePanelModel): string {
  const payload = {
    schema_version: model.schemaVersion,
    interpreted_intent: model.interpretedIntent,
    structured_interpretation: model.structuredInterpretation,
    interpretation_summary_ru: model.interpretationSummaryRu,
    interpretation_notes: model.interpretationNotes,
    sql_guardrails: model.sqlGuardrails,
    extracted_entities: model.extractedEntities,
    semantic_terms: model.semanticTerms.map((t) => ({
      term_key: t.termKey,
      surface_form: t.surfaceForm,
      sql_fragment: t.sqlFragment,
      confidence: t.confidence
    })),
    tables_used: model.tablesUsed,
    result_columns: model.resultColumns,
    generated_sql: model.generatedSql,
    validation_status: model.validationStatus,
    warnings: model.warnings,
    confidence: model.confidence,
    clarification_requested: model.clarificationRequested,
    clarification_reason: model.clarificationReason,
    clarification_reason_summary_ru: model.clarificationReasonSummaryRu,
    clarification_question: model.clarificationQuestion,
    follow_up_context_used: model.followUpContextUsed,
    learned_correction_used: model.learnedCorrectionUsed,
    chart_recommendation: {
      chart_type: model.chartRecommendation.chartType,
      rationale: model.chartRecommendation.rationale,
      alternatives: model.chartRecommendation.alternatives
    },
    forecast_mode: { active: model.forecastModeActive, method: model.forecastMethod },
    forecast_selection: {
      metric_key: model.forecastSelection.metricKey,
      selected_strategy: model.forecastSelection.selectedStrategy,
      data_quality: model.forecastSelection.dataQuality,
      backtest_summary: model.forecastSelection.backtestSummary
    },
    forecast_explainability: model.forecastExplainability,
    quality_gate: model.qualityGate,
    guardrails: model.guardrails,
    execution_phases: model.steps.map((s) => ({
      phase_id: s.id,
      label: s.label,
      status: s.status,
      detail: s.detail ?? ""
    })),
    logs: model.logs,
    resolved_source_table: model.resolvedSourceTable?.trim() || undefined
  };
  return JSON.stringify(payload, null, 2);
}

function stringifyCompact(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const pairs = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== null && v !== undefined && `${v}`.trim() !== "")
      .map(([k, v]) => `${k}: ${String(v)}`);
    return pairs.join(" · ");
  }
  return String(value);
}

type SummaryAccent = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const SUMMARY_ACCENT: Record<SummaryAccent, string> = {
  neutral: "border-border-subtle bg-surface-muted/50",
  brand: "border-brand-200/90 bg-brand-50/35",
  success: "border-emerald-200 bg-emerald-50/45",
  warning: "border-amber-200 bg-amber-50/45",
  danger: "border-danger/35 bg-danger-soft",
  info: "border-sky-200/90 bg-sky-50/40"
};

function intentAccentFromSummaryText(intent: string): SummaryAccent {
  const k = intent.toLowerCase();
  if (k === "unknown" || k === "—" || !k.trim()) return "neutral";
  if (/rank|топ|рейтинг|лучш|top/.test(k)) return "brand";
  if (/compar|сравн/.test(k)) return "info";
  if (/trend|динамик|динамика|тренд/.test(k)) return "success";
  if (/geo|карт|гео|map/.test(k)) return "info";
  if (/share|дол/.test(k)) return "warning";
  return "neutral";
}

function validationAccentFromStatus(status: TracePanelModel["validationStatus"]): SummaryAccent {
  if (status === "passed") return "success";
  if (status === "failed") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

function SummaryTile(props: {
  icon: ReactNode;
  label: string;
  accent?: SummaryAccent;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}) {
  const { icon, label, accent = "neutral", children, className = "", headerRight } = props;
  return (
    <div className={`rounded-md border px-2.5 py-2 ${SUMMARY_ACCENT[accent]} ${className}`}>
      <div className="flex gap-2">
        <span className="mt-0.5 shrink-0 text-foreground-muted [&>svg]:block [&>svg]:h-3.5 [&>svg]:w-3.5" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">{label}</p>
            {headerRight}
          </div>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function IconIntent() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
    </svg>
  );
}

function IconMetric() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5M4 19h16M8 17V9M12 17v-5M16 17v-3" />
    </svg>
  );
}

function IconFilter() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16l-6 7v5l-4 2v-7L4 4z" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 11h18" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" />
      <path d="m2 12 10 5 10-5M2 17l10 5 10-5" />
    </svg>
  );
}

function IconSql() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 8h10M7 12h6M7 16h8" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function IconMessage() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" />
      <path d="M7 16V9M12 16v-5M17 16V6" />
    </svg>
  );
}

export function TracePanel({
  model,
  onClose,
  className = "",
  lastPromptText = null,
  traceActionBusy = false,
  onTraceRerun,
  onScrollToClarification
}: TracePanelProps) {
  const [expandEpoch, setExpandEpoch] = useState(0);
  const [expandAll, setExpandAll] = useState(true);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  /** Пустая строка = авто (эвристика бэкенда из текста); иначе 1…90 шагов baseline. */
  const [forecastHorizonChoice, setForecastHorizonChoice] = useState("");

  const bumpLayout = useCallback((next: boolean) => {
    setExpandAll(next);
    setExpandEpoch((e) => e + 1);
  }, []);

  useEffect(() => {
    if (!copyHint) return;
    const t = window.setTimeout(() => setCopyHint(null), 2200);
    return () => window.clearTimeout(t);
  }, [copyHint]);

  const copyToClipboard = useCallback(async (label: string, text: string) => {
    if (!text.trim()) {
      setCopyHint("Нечего копировать");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopyHint(`${label} скопирован`);
    } catch {
      setCopyHint("Копирование не удалось (разрешения браузера)");
    }
  }, []);

  const qualityAttention = model.qualityGate.status !== "passed";
  const { ok, hint } = validationDerived(model.validationStatus);
  const hasSql = model.generatedSql.trim().length > 0;
  const hasEntities = Object.keys(model.extractedEntities).length > 0;
  const hasTerms = model.semanticTerms.length > 0;
  const hasTables = model.tablesUsed.length > 0;
  const hasCols = model.resultColumns.length > 0;
  const hasWarnings = model.warnings.length > 0;
  const chartType = model.chartRecommendation.chartType;
  const hasChartText =
    model.chartRecommendation.rationale.trim().length > 0 ||
    (chartType.length > 0 && chartType !== "table");
  const hasPipeline = model.steps.length > 0 || model.logs.length > 0;
  const hasGuardrailsBlock = model.guardrails.blocked && model.guardrails.messagesRu.length > 0;
  const hasSqlGuardrails = Object.keys(model.sqlGuardrails ?? {}).length > 0;
  const hasResolvedSource = Boolean(model.resolvedSourceTable?.trim());
  const hasBody = Boolean(
    hasGuardrailsBlock ||
      hasSqlGuardrails ||
      hasSql ||
      hasEntities ||
      hasTerms ||
      hasTables ||
      hasCols ||
      hasWarnings ||
      hasChartText ||
      model.interpretedIntent.trim() ||
      hasPipeline ||
      model.forecastModeActive ||
      model.clarificationRequested ||
      qualityAttention ||
      hasResolvedSource
  );

  const canRerun = Boolean((lastPromptText ?? "").trim() && onTraceRerun && !traceActionBusy);
  const nextChartKind = nextQuickChartKind(model.chartRecommendation.chartType);
  const lastRunHorizon =
    typeof model.forecastExplainability?.horizon_steps === "number"
      ? model.forecastExplainability.horizon_steps
      : null;
  const buildHorizonOpts = useCallback((): NotebookAnalyticsRunOptions => {
    if (!forecastHorizonChoice.trim()) return {};
    const n = Number.parseInt(forecastHorizonChoice, 10);
    if (!Number.isFinite(n) || n < 1 || n > 90) return {};
    return { forecast_horizon_steps: n };
  }, [forecastHorizonChoice]);
  const mergeRerunOpts = useCallback(
    (extra: NotebookAnalyticsRunOptions): NotebookAnalyticsRunOptions => ({
      ...buildHorizonOpts(),
      ...extra
    }),
    [buildHorizonOpts]
  );
  const actionBtn =
    "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-45";

  const open = expandAll;
  const si = (model.structuredInterpretation ?? {}) as Record<string, unknown>;
  const summaryIntent = stringifyCompact(si.intent) || model.interpretedIntent || "unknown";
  const summaryMetric =
    stringifyCompact(si.metric) || stringifyCompact((si.metrics as unknown[] | undefined)?.[0]) || "не определена";
  const summaryFilters = stringifyCompact(si.filters) || "нет";
  const timeObj = si.time_range && typeof si.time_range === "object" ? (si.time_range as Record<string, unknown>) : null;
  const summaryPeriod = stringifyCompact(timeObj?.label_ru) || stringifyCompact(timeObj?.preset) || "не определен";
  const summaryGrouping = stringifyCompact(si.grouping) || stringifyCompact(si.dimensions) || "нет";
  const sqlPreview = hasSql ? model.generatedSql.replace(/\s+/g, " ").trim().slice(0, 220) : "SQL отсутствует";
  const clarificationLabel = model.clarificationRequested ? "Требуется уточнение" : "Уточнение не требуется";
  const chartReason = model.chartRecommendation.rationale?.trim() || "Выбран базовый тип визуализации по форме данных.";
  const intentAccent = intentAccentFromSummaryText(summaryIntent);
  const validationAccent = validationAccentFromStatus(model.validationStatus);
  const clarificationAccent: SummaryAccent = model.clarificationRequested ? "warning" : "success";

  const qualityGateSection = (
    <CollapsibleSection key={`qg-${expandEpoch}`} title="Quality gate" defaultOpen={open && qualityAttention}>
      <p className="text-sm">
        <span className="font-semibold text-foreground-muted">Статус:</span>{" "}
        <span className="font-medium capitalize text-foreground">{model.qualityGate.status}</span>
      </p>
      {model.qualityGate.reasons.length > 0 ? (
        <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-foreground-secondary">
          {model.qualityGate.reasons.map((reason, i) => (
            <li key={`${reason}-${i}`}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-foreground-muted">Деградаций качества не обнаружено.</p>
      )}
    </CollapsibleSection>
  );

  const validationSection = (
    <CollapsibleSection key={`val-${expandEpoch}`} title="Валидация и предупреждения" defaultOpen={open}>
      <p className="mb-2 text-xs">
        <span className="font-semibold text-foreground-muted">Статус:</span>{" "}
        <span className="font-medium capitalize text-foreground">{model.validationStatus}</span>
      </p>
      {hasWarnings ? (
        <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-950">
          {model.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-foreground-muted">Предупреждений нет.</p>
      )}
    </CollapsibleSection>
  );

  const sqlSafetyExplainabilitySection = hasSqlGuardrails ? (
    <CollapsibleSection key={`sql-safe-${expandEpoch}`} title="Почему SQL разрешён / отклонён" defaultOpen={open}>
      {(() => {
        const g = model.sqlGuardrails as {
          decision?: string;
          reason_summary_ru?: string;
          triggered_rules?: string[];
          errors?: string[];
          warnings?: string[];
        };
        const decision = String(g.decision ?? "");
        const rules = Array.isArray(g.triggered_rules) ? g.triggered_rules.map(String) : [];
        const errs = Array.isArray(g.errors) ? g.errors.map(String) : [];
        const warns = Array.isArray(g.warnings) ? g.warnings.map(String) : [];
        return (
          <div className="space-y-2">
            <p className="text-xs">
              <span className="font-semibold text-foreground-muted">Решение:</span>{" "}
              <span className={decision === "rejected" ? "text-danger-bold" : "text-emerald-700"}>
                {decision === "rejected" ? "Отклонён" : "Разрешён"}
              </span>
            </p>
            {g.reason_summary_ru ? <p className="text-xs text-foreground-secondary">{g.reason_summary_ru}</p> : null}
            {rules.length ? (
              <p className="text-xs text-foreground-secondary">
                <span className="font-semibold text-foreground-muted">Сработавшие правила:</span> {rules.join(", ")}
              </p>
            ) : null}
            {errs.length ? (
              <ul className="list-inside list-disc space-y-0.5 text-xs text-danger-bold">
                {errs.map((e, i) => (
                  <li key={`sql-safe-err-${i}`}>{e}</li>
                ))}
              </ul>
            ) : null}
            {warns.length ? (
              <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-900">
                {warns.map((w, i) => (
                  <li key={`sql-safe-warn-${i}`}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })()}
    </CollapsibleSection>
  ) : null;

  return (
    <div
      className={`surface-section flex max-h-[min(85vh,900px)] flex-col shadow-card ${className}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border-subtle bg-surface-muted/35 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Explainability</p>
          <p className="truncate text-sm font-semibold text-foreground">Трассировка запроса</p>
          {hasResolvedSource ? (
            <p className="mt-1 text-[11px] leading-snug text-foreground-secondary">
              <span className="font-semibold text-foreground-muted">Источник данных:</span>{" "}
              <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-[11px] text-foreground">
                {model.resolvedSourceTable}
              </code>
            </p>
          ) : null}
          {qualityAttention ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-foreground-secondary">
              <span className="font-semibold text-foreground">Quality gate:</span> {model.qualityGate.status}
              {model.qualityGate.reasons.length > 0
                ? ` — ${model.qualityGate.reasons.slice(0, 2).join(" · ")}`
                : null}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <ConfidenceBadge value={model.confidence} />
          <ValidationBadge ok={ok} label={hint} danger={model.validationStatus === "failed"} />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="interactive-focus rounded-control p-1 text-foreground-muted transition hover:bg-surface-muted hover:text-foreground"
              aria-label="Закрыть trace"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-border-subtle px-4 py-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
          Запуск и контекст
        </p>
        <div className="flex flex-wrap gap-1.5">
          {model.clarificationRequested ? (
            onScrollToClarification ? (
              <button
                type="button"
                className={`${actionBtn} border-amber-300 bg-amber-50 text-amber-950 hover:border-amber-400`}
                onClick={() => onScrollToClarification()}
              >
                К уточнению
              </button>
            ) : (
              <span
                className={`${actionBtn} border-amber-200 bg-amber-50/80 text-amber-950`}
                title="Требуется уточнение"
              >
                Нужно уточнение
              </span>
            )
          ) : (
            <span
              className={`${actionBtn} border-border-subtle bg-surface-muted text-foreground-secondary`}
              title="Статус последнего запуска"
            >
              Без уточнения
            </span>
          )}
          <button
            type="button"
            disabled={!canRerun}
            title="Перезапуск того же промпта без follow-up памяти ноутбука"
            className={`${actionBtn} border-border-subtle bg-surface-card text-foreground-secondary hover:border-brand-200 hover:text-brand-900`}
            onClick={() => void onTraceRerun?.(mergeRerunOpts({ force_fresh_dialogue: true }))}
          >
            Сбросить контекст
          </button>
          <button
            type="button"
            disabled={!canRerun}
            title={
              model.learnedCorrectionUsed
                ? "Перезапуск без learned SQL из workspace"
                : "Показать пояснение, если learned-коррекция не применялась"
            }
            className={`${actionBtn} border-border-subtle bg-surface-card text-foreground-secondary hover:border-brand-200 hover:text-brand-900`}
            onClick={() => {
              if (!canRerun || !onTraceRerun) return;
              if (model.learnedCorrectionUsed) {
                void onTraceRerun(mergeRerunOpts({ skip_learned_corrections: true }));
              } else {
                setCopyHint("В этом запуске не применялась learned-коррекция SQL — перезапуск без неё не меняет результат.");
              }
            }}
          >
            Без learned SQL
          </button>
          <button
            type="button"
            disabled={!canRerun}
            title="Принудительно включить или выключить числовой прогноз по ряду"
            className={`${actionBtn} border-border-subtle bg-surface-card text-foreground-secondary hover:border-brand-200 hover:text-brand-900`}
            onClick={() =>
              void onTraceRerun?.(
                mergeRerunOpts({
                  forecast_sidecar: model.forecastModeActive ? "off" : "on"
                })
              )
            }
          >
            {model.forecastModeActive ? "Прогноз: выкл" : "Прогноз: вкл"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[200px] flex-1 flex-col gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
            Горизонт baseline (шагов)
            <select
              className="rounded-md border border-border-subtle bg-surface-card px-2 py-1.5 text-[12px] font-normal normal-case text-foreground shadow-xs outline-none transition hover:border-brand-200 focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:cursor-not-allowed disabled:opacity-60"
              value={forecastHorizonChoice}
              onChange={(e) => setForecastHorizonChoice(e.target.value)}
              disabled={!onTraceRerun}
              title={onTraceRerun ? "Подмешивается в перезапуски из этой панели" : "Станет доступен после запуска сценария из ячейки или композера"}
              aria-label="Число шагов baseline-прогноза при перезапуске из trace"
            >
              <option value="">Авто (из формулировки запроса)</option>
              {[4, 7, 8, 12, 14, 21, 28, 30, 45, 60, 90].map((n) => (
                <option key={n} value={String(n)}>
                  {n} шаг(ов)
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!canRerun}
            title="Перезапуск с выбранным горизонтом и включённым sidecar прогноза"
            className={`${actionBtn} shrink-0 border-brand-200 bg-brand-50 text-brand-900 hover:border-brand-300`}
            onClick={() => void onTraceRerun?.(mergeRerunOpts({ forecast_sidecar: "on" }))}
          >
            Перезапуск с прогнозом
          </button>
        </div>
        <p className="mt-1 text-[10px] leading-snug text-foreground-muted">
          Горизонт подмешивается во все быстрые перезапуски из панели (контекст, learned SQL, график, вкл/выкл прогноза).
          {lastRunHorizon != null ? ` В последнем запуске: ${lastRunHorizon} шаг(ов).` : null}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-foreground-secondary">
          <button
            type="button"
            disabled={!canRerun}
            title="Перезапуск с подменой типа графика в pipeline"
            className="rounded-md border border-border-subtle bg-surface-muted px-2 py-0.5 font-mono hover:border-brand-200 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => void onTraceRerun?.(mergeRerunOpts({ chart_type_override: nextChartKind }))}
          >
            График: {model.chartRecommendation.chartType} → {nextChartKind}
          </button>
          {model.forecastModeActive ? (
            <span className="rounded-md border border-border-subtle bg-surface-muted px-2 py-0.5 font-mono">
              Прогноз: {model.forecastMethod ?? "—"}
            </span>
          ) : (
            <span className="rounded-md border border-dashed border-border-subtle px-2 py-0.5 text-foreground-muted">
              Прогноз: выкл
            </span>
          )}
          <span
            className={`rounded-md border px-2 py-0.5 font-mono ${
              model.qualityGate.status === "failed"
                ? "border-danger/30 bg-danger-soft text-danger-bold"
                : model.qualityGate.status === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
            title="Итог проверки качества на стороне pipeline"
          >
            Quality gate: {model.qualityGate.status}
          </span>
        </div>
        {onTraceRerun && !canRerun && !traceActionBusy ? (
          <p className="mt-2 text-[11px] text-foreground-muted">
            Выполните промпт в ячейке или в композере — здесь можно будет перезапустить его с этими настройками.
          </p>
        ) : null}
        {traceActionBusy ? (
          <p className="mt-2 text-[11px] text-foreground-secondary">Запуск pipeline…</p>
        ) : null}
      </div>

      <div className="border-b border-border-subtle px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Секции</span>
          <button
            type="button"
            className="rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-[11px] font-semibold text-foreground-secondary hover:border-brand-200 hover:text-brand-900"
            onClick={() => bumpLayout(true)}
          >
            Развернуть всё
          </button>
          <button
            type="button"
            className="rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-[11px] font-semibold text-foreground-secondary hover:border-brand-200 hover:text-brand-900"
            onClick={() => bumpLayout(false)}
          >
            Свернуть всё
          </button>
          <button
            type="button"
            title={hasSql ? "Скопировать сгенерированный SQL" : "SQL ещё не сформирован — нажмите для подсказки"}
            className="rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-[11px] font-semibold text-foreground-secondary hover:border-brand-200 hover:text-brand-900"
            onClick={() => {
              if (hasSql) void copyToClipboard("SQL", model.generatedSql);
              else setCopyHint("SQL ещё не сформирован: дождитесь успешного запуска или проверьте блок уточнения.");
            }}
          >
            Копировать SQL
          </button>
          <button
            type="button"
            title={hasBody ? "Скопировать полный trace в JSON" : "Мало данных для экспорта — нажмите для подсказки"}
            className="rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-[11px] font-semibold text-foreground-secondary hover:border-brand-200 hover:text-brand-900"
            onClick={() => {
              if (hasBody) void copyToClipboard("Trace JSON", traceToExportJson(model));
              else setCopyHint("Пока нечего экспортировать: выполните запрос, чтобы заполнить трассировку.");
            }}
          >
            Копировать JSON
          </button>
        </div>
        {copyHint ? (
          <div className="enterprise-state-success mt-1.5 text-[11px] text-success-bold" role="status" aria-live="polite">
            {copyHint}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!hasBody ? (
          traceActionBusy ? (
            <UiStateSurface
              variant="loading"
              title="Загрузка explainability…"
              description="Дождитесь завершения перезапуска pipeline."
            />
          ) : (
            <UiStateSurface
              variant="empty"
              title="Trace ещё пуст"
              description="Запустите ячейку с промптом или дождитесь ответа аналитики — здесь появится интерпретация запроса, SQL и этапы pipeline."
            />
          )
        ) : (
          <div className="space-y-2">
            {traceActionBusy ? (
              <UiStateSurface
                variant="loading"
                title="Обновление trace…"
                description="Перезапуск с выбранными параметрами."
                dense
                className="py-2.5"
              />
            ) : null}
            {model.clarificationRequested ? (
              <UiStateSurface
                variant="ambiguity"
                title="Нужно уточнение"
                description={
                  model.clarificationReason?.trim() || model.clarificationQuestion?.trim()
                    ? undefined
                    : "Система не уверена в трактовке метрики или фильтров. Ответьте в ячейке уточнения или уточните формулировку."
                }
                dense
                className="space-y-2 py-2.5"
              >
                {model.clarificationReason?.trim() ? (
                  <p className="text-sm leading-relaxed text-foreground-secondary">
                    <span className="font-semibold text-foreground">Почему неоднозначно: </span>
                    {model.clarificationReasonSummaryRu?.trim() ||
                      clarificationReasonSummaryRu(model.clarificationReason.trim())}
                  </p>
                ) : null}
                {model.clarificationQuestion?.trim() ? (
                  <p className="text-sm leading-relaxed text-foreground">
                    <span className="font-semibold text-foreground-muted">Вопрос: </span>
                    {model.clarificationQuestion.trim()}
                  </p>
                ) : null}
                {!model.clarificationReason?.trim() && !model.clarificationQuestion?.trim() ? (
                  <p className="text-sm text-foreground-secondary">
                    Ответьте в ячейке уточнения или переформулируйте запрос.
                  </p>
                ) : null}
              </UiStateSurface>
            ) : null}
            <section className="rounded-control border border-border-subtle bg-gradient-to-b from-surface-card to-surface-muted/30 p-3 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                  Прозрачность pipeline
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-medium text-foreground-muted">Уверенность</span>
                  <ConfidenceBadge value={model.confidence} compact />
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <SummaryTile icon={<IconIntent />} label="Намерение (intent)" accent={intentAccent}>
                  <p className="text-xs font-semibold text-foreground">{summaryIntent}</p>
                </SummaryTile>
                <SummaryTile icon={<IconMetric />} label="Метрика" accent="neutral">
                  <p className="text-xs font-semibold text-foreground">{summaryMetric}</p>
                </SummaryTile>
                <SummaryTile icon={<IconFilter />} label="Фильтры" accent="neutral" className="sm:col-span-2">
                  <p className="text-xs leading-relaxed text-foreground-secondary">{summaryFilters}</p>
                </SummaryTile>
                <SummaryTile icon={<IconCalendar />} label="Период" accent="neutral">
                  <p className="text-xs text-foreground-secondary">{summaryPeriod}</p>
                </SummaryTile>
                <SummaryTile icon={<IconLayers />} label="Группировка" accent="neutral">
                  <p className="text-xs text-foreground-secondary">{summaryGrouping}</p>
                </SummaryTile>
                <SummaryTile
                  icon={<IconSql />}
                  label="SQL preview"
                  accent="neutral"
                  className="border-l-[3px] border-l-slate-600/80 sm:col-span-2"
                >
                  <p className="font-mono text-[11px] leading-relaxed text-foreground-secondary">{sqlPreview}</p>
                </SummaryTile>
                <SummaryTile
                  icon={<IconShield />}
                  label="Результат валидации"
                  accent={validationAccent}
                  headerRight={
                    <ValidationBadge
                      ok={ok}
                      label={hint}
                      compact
                      danger={model.validationStatus === "failed"}
                    />
                  }
                >
                  <p className="text-xs text-foreground-secondary">
                    {model.validationStatus}
                    {hasWarnings ? ` · предупреждений: ${model.warnings.length}` : ""}
                  </p>
                </SummaryTile>
                <SummaryTile icon={<IconMessage />} label="Уточнение" accent={clarificationAccent}>
                  <p className="text-xs text-foreground-secondary">{clarificationLabel}</p>
                  {model.clarificationRequested && model.clarificationQuestion?.trim() ? (
                    <p className="mt-1 text-xs font-medium leading-snug text-foreground">{model.clarificationQuestion.trim()}</p>
                  ) : null}
                  {model.clarificationRequested && model.clarificationReason?.trim() ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-foreground-muted">
                      {model.clarificationReasonSummaryRu?.trim() ||
                      clarificationReasonSummaryRu(model.clarificationReason.trim())}
                    </p>
                  ) : null}
                </SummaryTile>
                <SummaryTile icon={<IconChart />} label="Почему выбран график" accent="info" className="sm:col-span-2">
                  <p className="text-xs font-mono text-foreground-secondary">{model.chartRecommendation.chartType}</p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground-secondary">{chartReason}</p>
                </SummaryTile>
              </div>
            </section>

            {hasGuardrailsBlock ? (
              <div
                role="status"
                className="rounded-control border border-danger/35 bg-danger-soft px-3 py-2.5 text-sm text-danger-bold"
              >
                <p className="font-semibold">Запрос заблокирован политикой безопасности</p>
                {model.guardrails.codes.length > 0 ? (
                  <p className="mt-1 font-mono text-xs text-foreground-secondary">
                    {model.guardrails.codes.join(", ")}
                  </p>
                ) : null}
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-foreground">
                  {model.guardrails.messagesRu.map((m, i) => (
                    <li key={`${m}-${i}`}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <CollapsibleSection key={`intent-${expandEpoch}`} title="Интерпретированное намерение" defaultOpen={open}>
              <p className="text-foreground">{model.interpretedIntent || "—"}</p>
            </CollapsibleSection>

            {qualityAttention ? (
              <>
                {qualityGateSection}
                {validationSection}
                {sqlSafetyExplainabilitySection}
              </>
            ) : null}

            <CollapsibleSection key={`ent-${expandEpoch}`} title="Извлеченные сущности" defaultOpen={open}>
              {hasEntities ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-control border border-border-subtle bg-surface-muted/50 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                  {JSON.stringify(model.extractedEntities, null, 2)}
                </pre>
              ) : (
                <p className="text-foreground-muted">Для этого запуска нет структурированных сущностей.</p>
              )}
            </CollapsibleSection>

            <CollapsibleSection key={`sem-${expandEpoch}`} title="Семантические термины" defaultOpen={open}>
              {hasTerms ? (
                <ul className="space-y-2 text-xs">
                  {model.semanticTerms.map((t, i) => (
                    <li key={`${t.termKey}-${i}`} className="rounded-md border border-border-subtle bg-surface-muted/50 px-2 py-1.5">
                      <span className="font-semibold text-foreground">{t.surfaceForm || t.termKey}</span>
                      {t.termKey ? (
                        <span className="ml-2 font-mono text-[11px] text-foreground-secondary">{t.termKey}</span>
                      ) : null}
                      {t.sqlFragment ? (
                        <p className="mt-1 font-mono text-[11px] text-foreground-secondary">{t.sqlFragment}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-foreground-secondary">Уверенность {(t.confidence * 100).toFixed(0)}%</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-foreground-muted">Семантические разрешения не зафиксированы.</p>
              )}
            </CollapsibleSection>

            <CollapsibleSection key={`tbl-${expandEpoch}`} title="Таблицы и колонки" defaultOpen={open}>
              {hasTables ? (
                <p>
                  <span className="text-xs font-semibold text-foreground-muted">Таблицы</span>
                  <span className="ml-2 font-mono text-xs text-foreground">{model.tablesUsed.join(", ") || "—"}</span>
                </p>
              ) : (
                <p className="text-foreground-muted">В этом trace нет списка таблиц.</p>
              )}
              {hasCols ? (
                <p className={hasTables ? "mt-2" : ""}>
                  <span className="text-xs font-semibold text-foreground-muted">Результирующие колонки</span>
                  <span className="ml-2 font-mono text-xs text-foreground">{model.resultColumns.join(", ")}</span>
                </p>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection key={`sql-${expandEpoch}`} title="Сгенерированный SQL" defaultOpen={open}>
              {hasSql ? (
                <div className="space-y-2">
                  <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-700/70 bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] p-2 font-mono text-[11px] leading-relaxed text-slate-100">
                    {model.generatedSql}
                  </pre>
                  <button
                    type="button"
                    className="rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-[11px] font-semibold text-foreground-secondary hover:border-brand-200"
                    onClick={() => void copyToClipboard("SQL", model.generatedSql)}
                  >
                    Копировать этот SQL
                  </button>
                </div>
              ) : (
                <p className="text-foreground-muted">SQL отсутствует (например, ожидается уточнение).</p>
              )}
            </CollapsibleSection>

            {qualityAttention ? null : validationSection}
            {qualityAttention ? null : sqlSafetyExplainabilitySection}

            <CollapsibleSection key={`chart-${expandEpoch}`} title="Рекомендация графика" defaultOpen={open}>
              <p className="text-xs font-semibold text-foreground">{model.chartRecommendation.chartType}</p>
              {model.chartRecommendation.rationale ? (
                <p className="mt-1 text-sm text-foreground-secondary">{model.chartRecommendation.rationale}</p>
              ) : null}
              <p className="mt-1 text-xs text-foreground-muted">
                Тип графика можно переключить вручную в chart block без повторного SQL-запроса.
              </p>
              {model.chartRecommendation.alternatives.length > 0 ? (
                <p className="mt-2 text-xs text-foreground-muted">
                  Альтернативы: {model.chartRecommendation.alternatives.join(", ")}
                </p>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection key={`fc-${expandEpoch}`} title="Прогноз" defaultOpen={open}>
              <p className="text-xs text-foreground-muted">
                Baseline sidecar: полезное расширение аналитики, не отдельный production ML-контур.
              </p>
              <p className="mt-2 text-sm">
                <span className="font-semibold text-foreground-muted">Активен:</span>{" "}
                {model.forecastModeActive ? "Да" : "Нет"}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold text-foreground-muted">Метод:</span>{" "}
                <span className="font-mono text-xs">{model.forecastMethod ?? "—"}</span>
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold text-foreground-muted">Выбранная стратегия:</span>{" "}
                <span className="font-mono text-xs">{model.forecastSelection.selectedStrategy ?? "—"}</span>
              </p>
              {Object.keys(model.forecastSelection.dataQuality).length > 0 ? (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-control border border-border-subtle bg-surface-muted/50 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                  {JSON.stringify(model.forecastSelection.dataQuality, null, 2)}
                </pre>
              ) : null}
              {typeof model.forecastExplainability.explanation_ru === "string" &&
              (model.forecastExplainability.explanation_ru as string).trim() ? (
                <div className="mt-3 rounded-md border border-border-subtle bg-surface-muted/30 px-2 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Объяснение</p>
                  <p className="mt-1 text-sm leading-relaxed text-foreground-secondary">
                    {String(model.forecastExplainability.explanation_ru)}
                  </p>
                </div>
              ) : null}
              {typeof model.forecastExplainability.warning_ru === "string" &&
              (model.forecastExplainability.warning_ru as string).trim() ? (
                <p className="mt-2 text-sm text-amber-950">
                  <span className="font-semibold">Предупреждение: </span>
                  {String(model.forecastExplainability.warning_ru)}
                </p>
              ) : null}
              {Array.isArray(model.forecastExplainability.history) && model.forecastExplainability.history.length ? (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">История (хвост)</p>
                  <ul className="mt-1 max-h-36 space-y-1 overflow-auto font-mono text-[11px] text-foreground-secondary">
                    {(model.forecastExplainability.history as { period?: string; value?: number }[])
                      .slice(-10)
                      .map((h, i) => (
                        <li key={i} className="flex justify-between gap-2">
                          <span className="truncate text-foreground-muted">{String(h.period ?? "—")}</span>
                          <span>{h.value ?? "—"}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </CollapsibleSection>

            {qualityAttention ? null : qualityGateSection}

            {hasPipeline ? (
              <CollapsibleSection key={`pipe-${expandEpoch}`} title="Этапы выполнения" muted defaultOpen={open}>
                {model.steps.length > 0 ? (
                  <ul className="mb-3 space-y-2">
                    {model.steps.map((s) => (
                      <li key={s.id} className="flex gap-2 text-xs">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${stepDot[s.status] ?? stepDot.pending}`}
                        />
                        <div>
                          <p className="font-medium text-foreground">{s.label}</p>
                          {s.detail ? <p className="text-foreground-secondary">{s.detail}</p> : null}
                          {s.status === "skipped" && !s.detail ? (
                            <p className="text-foreground-muted">Этап не выполнялся в этом запуске.</p>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {model.logs.length > 0 ? (
                  <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-foreground-secondary">
                    {model.logs.map((l, i) => (
                      <li key={i} className="border-l-2 border-border-subtle pl-2">
                        {l.at ? <span className="text-foreground-muted">[{l.at}] </span> : null}
                        <span
                          className={
                            l.level === "error"
                              ? "text-danger"
                              : l.level === "warn"
                                ? "text-warning-bold"
                                : "text-foreground-secondary"
                          }
                        >
                          {l.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CollapsibleSection>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
