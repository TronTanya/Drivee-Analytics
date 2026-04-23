"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useId, useState } from "react";
import type { ChartKind, TracePanelModel } from "@/lib/notebook/block-types";
import type { TracePanelProps } from "@/lib/notebook/block-types";
import { ConfidenceBadge } from "@/components/notebook/confidence-badge";
import { ValidationBadge } from "@/components/notebook/validation-badge";

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
    quality_gate: model.qualityGate,
    guardrails: model.guardrails,
    execution_phases: model.steps.map((s) => ({
      phase_id: s.id,
      label: s.label,
      status: s.status,
      detail: s.detail ?? ""
    })),
    logs: model.logs
  };
  return JSON.stringify(payload, null, 2);
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
  const hasBody = Boolean(
    hasGuardrailsBlock ||
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
      qualityAttention
  );

  const canRerun = Boolean((lastPromptText ?? "").trim() && onTraceRerun && !traceActionBusy);
  const nextChartKind = nextQuickChartKind(model.chartRecommendation.chartType);
  const actionBtn =
    "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-45";

  const open = expandAll;

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

  return (
    <div
      className={`surface-section flex max-h-[min(85vh,900px)] flex-col shadow-card ${className}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border-subtle bg-surface-muted/35 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Explainability</p>
          <p className="truncate text-sm font-semibold text-foreground">Трассировка запроса</p>
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
          <ValidationBadge ok={ok} label={hint} />
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
            onClick={() => void onTraceRerun?.({ force_fresh_dialogue: true })}
          >
            Сбросить контекст
          </button>
          <button
            type="button"
            disabled={!canRerun || !model.learnedCorrectionUsed}
            title={
              model.learnedCorrectionUsed
                ? "Перезапуск без learned SQL из workspace"
                : "В этом запуске не использовался learned fix"
            }
            className={`${actionBtn} border-border-subtle bg-surface-card text-foreground-secondary hover:border-brand-200 hover:text-brand-900`}
            onClick={() => void onTraceRerun?.({ skip_learned_corrections: true })}
          >
            Без learned SQL
          </button>
          <button
            type="button"
            disabled={!canRerun}
            title="Принудительно включить или выключить числовой прогноз по ряду"
            className={`${actionBtn} border-border-subtle bg-surface-card text-foreground-secondary hover:border-brand-200 hover:text-brand-900`}
            onClick={() =>
              void onTraceRerun?.({
                forecast_sidecar: model.forecastModeActive ? "off" : "on"
              })
            }
          >
            {model.forecastModeActive ? "Прогноз: выкл" : "Прогноз: вкл"}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-foreground-secondary">
          <button
            type="button"
            disabled={!canRerun}
            title="Перезапуск с подменой типа графика в pipeline"
            className="rounded-md border border-border-subtle bg-surface-muted px-2 py-0.5 font-mono hover:border-brand-200 disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => void onTraceRerun?.({ chart_type_override: nextChartKind })}
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
            disabled={!hasSql}
            className="rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-[11px] font-semibold text-foreground-secondary hover:border-brand-200 hover:text-brand-900 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void copyToClipboard("SQL", model.generatedSql)}
          >
            Копировать SQL
          </button>
          <button
            type="button"
            disabled={!hasBody}
            className="rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-[11px] font-semibold text-foreground-secondary hover:border-brand-200 hover:text-brand-900 disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void copyToClipboard("Trace JSON", traceToExportJson(model))}
          >
            Копировать JSON
          </button>
        </div>
        {copyHint ? (
          <p className="mt-1.5 text-[11px] text-emerald-800" role="status" aria-live="polite">
            {copyHint}
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!hasBody ? (
          <p className="text-sm text-foreground-secondary">Запустите ячейку, чтобы заполнить explainability trace.</p>
        ) : (
          <div className="space-y-2">
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
              <p className="text-sm">
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
