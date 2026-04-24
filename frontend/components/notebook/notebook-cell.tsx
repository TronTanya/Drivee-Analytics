"use client";

import type { ChartKind, NotebookBlock, NotebookCellProps } from "@/lib/notebook/block-types";
import { RunCellButton } from "@/components/notebook/run-cell-button";
import { ChartCell } from "@/components/notebook/cells/chart-cell";
import { ClarificationCell } from "@/components/notebook/cells/clarification-cell";
import { ForecastCell } from "@/components/notebook/cells/forecast-cell";
import { InsightCell } from "@/components/notebook/cells/insight-cell";
import { PromptCell } from "@/components/notebook/cells/prompt-cell";
import { SqlCell } from "@/components/notebook/cells/sql-cell";
import { TableCell } from "@/components/notebook/cells/table-cell";
import { TraceSummaryCell } from "@/components/notebook/cells/trace-summary-cell";
import { Badge } from "@/components/ui/badge";

const TYPE_LABEL: Record<NotebookBlock["type"], string> = {
  prompt: "Промпт",
  sql: "SQL",
  table: "Таблица",
  chart: "График",
  insight: "Инсайт",
  clarification: "Уточнение",
  forecast: "Прогноз",
  trace: "План"
};

function canRun(block: NotebookBlock): block is Extract<NotebookBlock, { type: "sql" | "table" | "chart" }> {
  return block.type === "sql" || block.type === "table" || block.type === "chart";
}

function CellBody({
  block,
  onChartTypeChange,
  onPromptChange,
  onPromptSubmit,
  promptBusy,
  onClarificationSelect,
  clarificationBusy
}: {
  block: NotebookBlock;
  onChartTypeChange?: (id: string, chartType: ChartKind) => void;
  onPromptChange?: (id: string, text: string) => void;
  onPromptSubmit?: (id: string, text: string) => void;
  promptBusy?: boolean;
  onClarificationSelect?: (id: string, optionId: string, optionLabel: string) => void;
  clarificationBusy?: boolean;
}) {
  switch (block.type) {
    case "prompt":
      return (
        <PromptCell
          block={block}
          onChange={onPromptChange ? (text) => onPromptChange(block.id, text) : undefined}
          onSubmit={onPromptSubmit ? (text) => onPromptSubmit(block.id, text) : undefined}
          disabled={promptBusy}
        />
      );
    case "sql":
      return <SqlCell block={block} />;
    case "table":
      return <TableCell block={block} />;
    case "chart":
      return (
        <ChartCell
          block={block}
          onTypeChange={onChartTypeChange ? (t) => onChartTypeChange(block.id, t) : undefined}
        />
      );
    case "insight":
      return <InsightCell block={block} />;
    case "clarification":
      return (
        <ClarificationCell
          block={block}
          onSelectOption={
            onClarificationSelect ? (optionId, optionLabel) => onClarificationSelect(block.id, optionId, optionLabel) : undefined
          }
          disabled={clarificationBusy}
        />
      );
    case "forecast":
      return <ForecastCell block={block} />;
    case "trace":
      return <TraceSummaryCell block={block} />;
    default:
      return null;
  }
}

export function NotebookCell({
  index,
  block,
  onRunCell,
  onChartTypeChange,
  onPromptChange,
  onPromptSubmit,
  onClarificationSelect,
  clarificationBusy
}: NotebookCellProps) {
  const runnable = canRun(block);
  const running = block.status === "running";
  /** Пока ячейка в running — показываем баннер (для уточнения — отдельный текст про второй проход pipeline). */
  const showRunningBanner = running;
  const failed = block.status === "error";
  const success = block.status === "success";
  const runAccent = failed
    ? "border-l-danger"
    : running
      ? "border-l-brand-500"
      : success
        ? "border-l-emerald-500"
        : "border-l-transparent";

  return (
    <article
      id={block.type === "clarification" ? "notebook-clarification-cell" : undefined}
      className={`surface-content group border-l-4 ${runAccent} p-4 shadow-xs transition hover:shadow-soft`.trim()}
    >
      <div className="flex gap-3 sm:gap-4">
        <div className="flex w-8 shrink-0 flex-col items-center pt-0.5 sm:w-9">
          <span className="rounded-full border border-border-subtle bg-surface-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground-muted">
            {index + 1}
          </span>
          <span className="mt-2 hidden h-8 w-px bg-border-subtle sm:block" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <Badge tone="neutral">{TYPE_LABEL[block.type]}</Badge>
            {runnable && onRunCell ? (
              <div className="w-full sm:w-auto">
                <RunCellButton onClick={() => onRunCell(block.id)} loading={running} disabled={running} />
              </div>
            ) : null}
          </div>

          {failed && block.errorMessage ? (
            <div className="enterprise-state-error text-xs text-danger-bold">
              <p className="font-semibold">Ошибка ячейки</p>
              <p className="mt-1 text-sm">{block.errorMessage}</p>
            </div>
          ) : null}

          {showRunningBanner ? (
            <div
              className="rounded-control border border-brand-200/90 bg-brand-50/60 px-3 py-2 text-xs text-brand-950"
              role="status"
              aria-live="polite"
            >
              {block.type === "clarification" ? (
                <>
                  <span className="font-semibold">Продолжаем аналитику</span> — выбранный вариант учтён, выполняется
                  повторный запуск pipeline (SQL, таблица, график). При работе через LLM это часто{" "}
                  <span className="whitespace-nowrap">30 с — 2 мин.</span>
                </>
              ) : (
                <>
                  <span className="font-semibold">Выполняется</span> — ожидайте ответ pipeline…
                </>
              )}
            </div>
          ) : null}

          <CellBody
            block={block}
            onChartTypeChange={onChartTypeChange}
            onPromptChange={onPromptChange}
            onPromptSubmit={onPromptSubmit}
            promptBusy={block.status === "running"}
            onClarificationSelect={onClarificationSelect}
            clarificationBusy={clarificationBusy}
          />
        </div>
      </div>
    </article>
  );
}
