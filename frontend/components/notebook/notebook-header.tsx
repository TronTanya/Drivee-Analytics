import type { NotebookHeaderProps } from "@/lib/notebook/block-types";

export function NotebookHeader({
  title,
  subtitle,
  notebookId,
  updatedAtLabel,
  runState = "idle",
  runPhaseHint,
  trailing
}: NotebookHeaderProps) {
  const badgeClass =
    runState === "running"
      ? "border-brand-200 bg-brand-50 text-brand-800"
      : runState === "failed"
        ? "border-danger/30 bg-danger-soft text-danger-bold"
        : "border-border-subtle bg-surface-muted text-foreground-secondary";
  const badgeLabel = runState === "running" ? "Выполняется" : runState === "failed" ? "Ошибка" : "Готово";
  return (
    <header className="rounded-card border border-border-subtle bg-gradient-to-br from-surface-card via-surface-card to-brand-50/20 px-5 py-4 shadow-xs">
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-baseline gap-2 gap-y-1">
            <h1 className="max-w-full break-words text-balance text-heading-1 text-foreground">{title}</h1>
            <span
              className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${badgeClass}`}
            >
              {badgeLabel}
            </span>
          </div>
          {runState === "running" && runPhaseHint ? (
            <p className="text-xs font-medium text-brand-800" role="status" aria-live="polite">
              {runPhaseHint}
            </p>
          ) : null}
          {subtitle ? (
            <p className="max-w-prose text-pretty text-sm leading-relaxed text-foreground-secondary">{subtitle}</p>
          ) : null}
          <p className="text-xs text-foreground-muted">
            <span className="break-all font-mono text-foreground-secondary">{notebookId}</span>
            {updatedAtLabel ? <span className="text-foreground-muted"> · {updatedAtLabel}</span> : null}
          </p>
        </div>
        {trailing ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:gap-3">{trailing}</div>
        ) : null}
      </div>
    </header>
  );
}
