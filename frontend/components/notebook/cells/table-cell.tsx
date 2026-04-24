import type { TableCellProps } from "@/lib/notebook/block-types";
import { UiStateSurface } from "@/components/ui/state-surface";

export function TableCell({ block }: TableCellProps) {
  const emptyCols = !block.columns.length;
  const empty = !block.rows.length;

  if (emptyCols) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Результат запроса</span>
          {block.caption ? <span className="text-xs text-foreground-secondary">{block.caption}</span> : null}
        </div>
        <UiStateSurface
          variant="empty"
          title="Нет колонок"
          description="Структура результата не определена. Проверьте ответ API или перезапустите запрос."
        />
      </div>
    );
  }

  if (empty) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Результат запроса</span>
          {block.caption ? <span className="text-xs text-foreground-secondary">{block.caption}</span> : null}
        </div>
        <UiStateSurface
          variant="empty"
          title="Нет строк"
          description="SQL выполнен, но результат пустой. Проверьте фильтры или период в промпте."
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Результат запроса</span>
        {block.caption ? <span className="text-xs text-foreground-secondary">{block.caption}</span> : null}
      </div>
      <div className="space-y-2 sm:hidden">
        {block.rows.slice(0, 5).map((row, ri) => (
          <article key={ri} className="rounded-control border border-border-subtle bg-surface-card p-2.5 shadow-xs">
            <dl className="space-y-1.5">
              {block.columns.map((col) => (
                <div key={col} className="grid grid-cols-[110px_1fr] gap-2 text-xs">
                  <dt className="truncate font-semibold text-foreground-secondary">{col}</dt>
                  <dd className="truncate text-foreground">{String(row[col] ?? "—")}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <div className="enterprise-table-shell hidden sm:block">
        <table className="w-full min-w-[320px] border-collapse text-left text-body-sm">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-muted/70">
              {block.columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-foreground-secondary">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border-subtle/80 last:border-0 hover:bg-surface-muted/50">
                {block.columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-3 py-2 tabular-nums text-foreground">
                    {String(row[col] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
