"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ChartKind, NotebookBlock, TracePanelModel } from "@/lib/notebook/block-types";
import { sqlColumnLabelRu } from "@/lib/notebook/sql-column-labels";
import { ConfidenceBadge } from "@/components/notebook/confidence-badge";
import { SqlCell } from "@/components/notebook/cells/sql-cell";
import { ChartContainer } from "@/components/notebook/chart-container";
import { ChartRenderer } from "@/components/notebook/chart-renderer";

function meaningfulTable(block: Extract<NotebookBlock, { type: "table" }>): boolean {
  return (
    Array.isArray(block.columns) &&
    block.columns.length > 0 &&
    Array.isArray(block.rows) &&
    block.rows.length > 0 &&
    !(
      block.columns.length === 1 &&
      block.columns[0]?.toLowerCase() === "note" &&
      block.rows.length === 1 &&
      typeof block.rows[0]?.note === "string" &&
      ["[]", "", "null", "undefined"].includes(block.rows[0].note.trim().toLowerCase())
    )
  );
}

function meaningfulChart(block: Extract<NotebookBlock, { type: "chart" }>): boolean {
  return (
    typeof block.xKey === "string" &&
    block.xKey.length > 0 &&
    Array.isArray(block.series) &&
    block.series.length > 0 &&
    Array.isArray(block.data) &&
    block.data.length > 0
  );
}

export type AnalysisRunSummaryProps = {
  blocks: NotebookBlock[];
  traceModel: TracePanelModel;
  onSaveReport: () => void;
  savingReport: boolean;
  onRerunLast?: () => void;
  runBusy?: boolean;
  onChartTypeChange?: (id: string, chartType: ChartKind) => void;
  clarificationPending?: boolean;
  /** Открыть боковую панель explainability trace (обязательный элемент сценария). */
  onOpenTrace?: () => void;
  /** Ссылка на словарь (например только для admin). */
  showDictionaryLink?: boolean;
  onAcceptInterpretation?: () => void;
  onEditInterpretation?: () => void;
  interpretationActionsBusy?: boolean;
  interpretationAccepted?: boolean;
};

export function AnalysisRunSummary({
  blocks,
  traceModel,
  onSaveReport,
  savingReport,
  onRerunLast,
  runBusy,
  onChartTypeChange,
  clarificationPending,
  onOpenTrace,
  showDictionaryLink,
  onAcceptInterpretation,
  onEditInterpretation,
  interpretationActionsBusy,
  interpretationAccepted
}: AnalysisRunSummaryProps) {
  const lastPrompt = [...blocks].reverse().find((b) => b.type === "prompt");
  const promptText = lastPrompt && lastPrompt.type === "prompt" ? lastPrompt.text.trim() : "";
  const sqlBlock = [...blocks].reverse().find((b) => b.type === "sql");
  const sqlText = (sqlBlock && sqlBlock.type === "sql" ? sqlBlock.sql : traceModel.generatedSql)?.trim() ?? "";
  const sqlCell =
    sqlBlock && sqlBlock.type === "sql"
      ? sqlBlock
      : ({
          id: "summary-sql",
          type: "sql" as const,
          status: "success" as const,
          sql: sqlText || "—",
          dialect: "ANSI SQL",
          validated: traceModel.validationStatus === "passed"
        } as const);
  const table = [...blocks].reverse().find((b): b is Extract<NotebookBlock, { type: "table" }> => b.type === "table");
  const chart = [...blocks].reverse().find((b): b is Extract<NotebookBlock, { type: "chart" }> => b.type === "chart");
  const insight = [...blocks].reverse().find((b) => b.type === "insight");

  const qualityReasons =
    traceModel.qualityGate.status !== "passed" && traceModel.qualityGate.reasons?.length
      ? traceModel.qualityGate.reasons
      : [];
  const warnings = [
    ...traceModel.warnings,
    ...(traceModel.guardrails.messagesRu ?? []),
    ...qualityReasons
  ];
  const uniqWarnings = Array.from(new Set(warnings.map((w) => w.trim()).filter(Boolean)));

  const hasTable = table && meaningfulTable(table);
  const hasChart = chart && meaningfulChart(chart);
  const interpretation =
    traceModel.interpretedIntent?.trim() ||
    (insight && insight.type === "insight" ? insight.summary?.trim() : "") ||
    "—";

  const sqlTouchesTrain =
    /\btrain\b/i.test(sqlText) || /\btrain\b/i.test(traceModel.resolvedSourceTable ?? "");
  const hasSemantic = traceModel.semanticTerms.length > 0;
  const hasIntent = Boolean(traceModel.interpretedIntent?.trim());
  const validationDone = traceModel.validationStatus !== "unknown";
  const executedOk = Boolean(hasTable || hasChart);
  const hasInsightBody = Boolean(
    insight &&
      insight.type === "insight" &&
      (insight.title?.trim() || insight.summary?.trim() || (insight.bullets?.length ?? 0) > 0)
  );
  const hasTraceBody = traceModel.steps.length > 0 || traceModel.logs.length > 0;
  const clarificationBlock = [...blocks].reverse().find((b) => b.type === "clarification");
  const clarificationVisible =
    clarificationBlock &&
    clarificationBlock.type === "clarification" &&
    (clarificationBlock.options?.length ?? 0) > 0;

  const scenarioRows: { label: string; ok: boolean }[] = [
    { label: "Пользователь задал вопрос", ok: Boolean(promptText) },
    { label: "Система разобрала intent", ok: hasIntent },
    { label: "Привязка к semantic layer", ok: hasSemantic || hasIntent },
    { label: "SQL к каноническому train / источнику", ok: sqlTouchesTrain },
    { label: "Валидация SQL", ok: validationDone },
    { label: "Выполнение запроса", ok: executedOk },
    { label: "Таблица результатов", ok: Boolean(hasTable) },
    { label: "Выбор графика", ok: Boolean(hasChart) },
    { label: "Инсайт", ok: hasInsightBody },
    { label: "Explainability trace", ok: hasTraceBody },
    {
      label: "Сохранение в отчёт (кнопка выше)",
      ok: Boolean(promptText && (hasTable || hasChart || hasInsightBody))
    }
  ];

  const tableCaption =
    table && table.type === "table" && typeof table.caption === "string" && table.caption.trim()
      ? table.caption.trim()
      : null;
  const rowCount = hasTable && table ? table.rows.length : 0;
  const colCount = hasTable && table ? table.columns.length : 0;

  return (
    <section className="overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-[0_1px_0_rgba(15,23,42,0.04),0_12px_40px_-18px_rgba(15,23,42,0.12)]">
      <header className="flex flex-col gap-3 border-b border-border-subtle/80 bg-gradient-to-r from-surface-muted/50 to-surface-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Результат запроса</p>
          <h2 className="mt-1 text-heading-3 text-foreground">Обзор ответа</h2>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2 sm:justify-end">
          {onRerunLast ? (
            <button
              type="button"
              onClick={onRerunLast}
              disabled={runBusy || !promptText}
              className="rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary shadow-xs hover:border-brand-200 hover:text-brand-800 disabled:opacity-50"
            >
              Перезапустить
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSaveReport}
            disabled={savingReport}
            className="rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-xs hover:bg-emerald-100 disabled:opacity-60"
          >
            {savingReport ? "Сохранение…" : "Сохранить отчёт"}
          </button>
        </div>
      </header>

      <div className="space-y-6 px-5 py-5">
        {traceModel.resolvedSourceTable?.trim() ? (
          <p className="text-xs text-foreground-secondary">
            <span className="font-semibold text-foreground-muted">Источник данных (контекст SQL):</span>{" "}
            <code className="rounded border border-border-subtle bg-surface-muted/50 px-1.5 py-0.5 font-mono text-[11px]">
              {traceModel.resolvedSourceTable}
            </code>
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Исходный вопрос</p>
            <blockquote className="rounded-control border border-brand-100 bg-brand-50/50 px-4 py-3 text-sm leading-relaxed text-foreground">
              {promptText || <span className="text-foreground-muted">Введите вопрос в композере ниже.</span>}
            </blockquote>
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              Как понят запрос
              <span className="mt-0.5 block font-normal normal-case text-foreground-muted">Intent и краткая формулировка</span>
            </p>
            <p className="rounded-control border border-border-subtle bg-surface-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground-secondary">
              {interpretation}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ConfidenceBadge value={traceModel.confidence} />
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                  traceModel.validationStatus === "passed"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : traceModel.validationStatus === "failed"
                      ? "border-danger/30 bg-danger-soft text-danger-bold"
                      : "border-border-subtle bg-surface-muted text-foreground-secondary"
                }`}
              >
                SQL: {traceModel.validationStatus}
              </span>
              {clarificationPending ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950">
                  Нужно уточнение
                </span>
              ) : null}
              {traceModel.qualityGate.status !== "passed" ? (
                <span
                  title={
                    traceModel.qualityGate.status === "failed"
                      ? "Критично: pipeline или данные не прошли проверку (см. предупреждения ниже)."
                      : "Предупреждение: результат доступен, но есть замечания (пустая выборка, валидация SQL и т.д.) — проверьте блок предупреждений."
                  }
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                    traceModel.qualityGate.status === "failed"
                      ? "border-danger/30 bg-danger-soft text-danger-bold"
                      : "border-amber-200 bg-amber-50 text-amber-950"
                  }`}
                >
                  Качество: {traceModel.qualityGate.status}
                </span>
              ) : null}
            </div>
            {showDictionaryLink || onAcceptInterpretation || onEditInterpretation ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-subtle/60 pt-3">
                {showDictionaryLink ? (
                  <Link
                    href={"/dictionary" as Route}
                    className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-2.5 py-1 text-[11px] font-semibold text-brand-800 hover:bg-surface-muted"
                  >
                    Открыть словарь
                  </Link>
                ) : null}
                {onAcceptInterpretation ? (
                  <button
                    type="button"
                    onClick={onAcceptInterpretation}
                    disabled={interpretationActionsBusy || interpretationAccepted}
                    className="interactive-focus rounded-control border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    {interpretationAccepted ? "Трактовка принята" : interpretationActionsBusy ? "Сохранение…" : "Принять трактовку"}
                  </button>
                ) : null}
                {onEditInterpretation ? (
                  <button
                    type="button"
                    onClick={onEditInterpretation}
                    disabled={interpretationActionsBusy}
                    className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-2.5 py-1 text-[11px] font-semibold text-foreground-secondary hover:bg-surface-muted disabled:opacity-50"
                  >
                    Уточнить трактовку
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-control border border-slate-200/90 bg-slate-50/60 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Сценарий pipeline</p>
          <p className="mt-1 text-xs text-foreground-secondary">
            Контрольный список шагов NL→SQL (канонический слой{" "}
            <code className="rounded bg-white/80 px-1 font-mono text-[11px]">train</code>).
          </p>
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {scenarioRows.map((row, i) => (
              <li
                key={row.label}
                className={`flex items-start gap-2 text-xs ${
                  row.ok ? "text-emerald-900" : "text-foreground-muted"
                }`}
              >
                <span className="mt-0.5 font-mono text-[11px] font-semibold text-foreground-muted">{i + 1}.</span>
                <span className={row.ok ? "font-medium" : ""}>
                  {row.ok ? "✓ " : "○ "}
                  {row.label}
                </span>
              </li>
            ))}
          </ol>
          {onOpenTrace ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-3">
              <button
                type="button"
                onClick={onOpenTrace}
                className="interactive-focus rounded-control border border-brand-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-900 shadow-xs hover:bg-brand-50"
              >
                Открыть explainability trace
              </button>
              <span className="text-[11px] text-foreground-muted">
                Фазы, семантика, guardrails и логи — в боковой панели.
              </span>
            </div>
          ) : null}
        </div>

        <div className="rounded-control border border-border-subtle bg-surface-muted/35 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Сводка результата</p>
          <dl className="mt-2 grid gap-1.5 text-sm text-foreground-secondary sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Строк / колонок</dt>
              <dd className="font-medium text-foreground">
                {hasTable ? `${rowCount} × ${colCount}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">График</dt>
              <dd className="font-medium text-foreground">{hasChart && chart ? chart.chartType : "—"}</dd>
            </div>
            {tableCaption ? (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Подпись таблицы</dt>
                <dd className="text-sm text-foreground-secondary">{tableCaption}</dd>
              </div>
            ) : null}
          </dl>
          {clarificationVisible ? (
            <p className="mt-2 text-xs text-amber-950">
              <span className="font-semibold">Clarification:</span> выберите вариант в блоке уточнения ниже
              {clarificationPending ? " (ожидается ответ)." : "."}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">SQL</p>
          <SqlCell block={sqlCell} />
        </div>

        {uniqWarnings.length ? (
          <div className="rounded-control border border-amber-200/80 bg-amber-50/80 px-4 py-3">
            <p className="text-xs font-semibold text-amber-950">Предупреждения и уточнения</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-950/95">
              {uniqWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Таблица</p>
            {!hasTable ? (
              <p className="rounded-control border border-dashed border-border-subtle bg-surface-muted/40 px-4 py-8 text-center text-sm text-foreground-muted">
                Нет табличных данных для превью.
              </p>
            ) : (
              <div className="overflow-hidden rounded-control border border-border-subtle shadow-xs">
                <div className="max-h-72 overflow-auto">
                  <table className="w-full min-w-[280px] border-collapse text-left text-body-sm">
                    <thead className="sticky top-0 z-[1] border-b border-border-subtle bg-surface-muted/90 backdrop-blur-sm">
                      <tr>
                        {table.columns.map((col) => (
                          <th
                            key={col}
                            className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-secondary"
                          >
                            {(table.columnLabels?.[col] ?? "").trim() || sqlColumnLabelRu(col)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.slice(0, 12).map((row, ri) => (
                        <tr key={ri} className="border-b border-border-subtle/70 last:border-0">
                          {table.columns.map((col) => (
                            <td key={col} className="whitespace-nowrap px-3 py-2 tabular-nums text-foreground">
                              {String(row[col] ?? "—")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {table.rows.length > 12 ? (
                  <p className="border-t border-border-subtle bg-surface-muted/50 px-3 py-2 text-[11px] text-foreground-muted">
                    Показаны первые 12 из {table.rows.length} строк — полная таблица в блоке ниже.
                  </p>
                ) : null}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">График</p>
            {!hasChart || !chart ? (
              <p className="rounded-control border border-dashed border-border-subtle bg-surface-muted/40 px-4 py-8 text-center text-sm text-foreground-muted">
                Нет данных для графика.
              </p>
            ) : (
              <ChartContainer
                block={chart}
                onTypeChange={onChartTypeChange ? (next) => onChartTypeChange(chart.id, next) : undefined}
                body={<ChartRenderer block={chart} />}
              />
            )}
          </div>
        </div>

        <div className="rounded-control border border-emerald-100 bg-gradient-to-br from-emerald-50/80 to-surface-card px-4 py-4 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900/80">Ключевой инсайт</p>
          {insight && insight.type === "insight" ? (
            <div className="mt-2 space-y-2">
              <p className="text-base font-semibold text-foreground">{insight.title}</p>
              {insight.summary ? <p className="text-sm text-foreground-secondary">{insight.summary}</p> : null}
              {insight.bullets.length ? (
                <ul className="list-inside list-disc space-y-1 text-sm text-foreground-secondary">
                  {insight.bullets.slice(0, 5).map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-foreground-muted">Инсайт появится после выполнения pipeline.</p>
          )}
        </div>
      </div>
    </section>
  );
}
