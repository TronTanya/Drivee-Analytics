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
  onClarificationSelect?: (id: string, optionId: string) => void;
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
          onSelectOption={onClarificationSelect ? (optionId) => onClarificationSelect(block.id, optionId) : undefined}
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
  const failed = block.status === "error";

  return (
    <article className="surface-content group p-4 transition hover:border-brand-200/70 hover:shadow-soft">
      <div className="flex gap-3 sm:gap-4">
        <div className="flex w-8 shrink-0 flex-col items-center pt-0.5 sm:w-9">
          <span className="rounded-full border border-border-subtle bg-surface-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground-muted">
            {index + 1}
          </span>
          <span className="mt-2 hidden h-8 w-px bg-border-subtle sm:block" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <span className="rounded-full border border-border-subtle bg-surface-muted px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground-secondary">
              {TYPE_LABEL[block.type]}
            </span>
            {runnable && onRunCell ? (
              <div className="w-full sm:w-auto">
                <RunCellButton onClick={() => onRunCell(block.id)} loading={running} disabled={running} />
              </div>
            ) : null}
          </div>

          {failed && block.errorMessage ? (
            <div className="rounded-control border border-danger/25 bg-danger-soft px-3 py-2 text-xs text-danger-bold">
              {block.errorMessage}
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
