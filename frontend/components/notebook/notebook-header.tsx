import type { NotebookHeaderProps } from "@/lib/notebook/block-types";

export function NotebookHeader({
  title,
  subtitle,
  notebookId,
  updatedAtLabel,
  runState = "idle",
  trailing
}: NotebookHeaderProps) {
  return (
    <header className="rounded-card border border-border-subtle bg-gradient-to-br from-surface-card via-surface-card to-brand-50/20 px-5 py-4 shadow-xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-heading-1 text-foreground">{title}</h1>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                runState === "running"
                  ? "border-brand-200 bg-brand-50 text-brand-800"
                  : "border-border-subtle bg-surface-muted text-foreground-secondary"
              }`}
            >
              {runState === "running" ? "Выполняется" : "Готово"}
            </span>
          </div>
          {subtitle ? <p className="text-sm text-foreground-secondary">{subtitle}</p> : null}
          <p className="text-xs text-foreground-muted">
            <span className="font-mono text-foreground-secondary">{notebookId}</span>
            {updatedAtLabel ? <span className="text-foreground-muted"> · {updatedAtLabel}</span> : null}
          </p>
        </div>
        {trailing ? <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{trailing}</div> : null}
      </div>
    </header>
  );
}
