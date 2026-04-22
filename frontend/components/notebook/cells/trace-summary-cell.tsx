import type { TraceBlock } from "@/lib/notebook/block-types";

export function TraceSummaryCell({ block }: { block: TraceBlock }) {
  return (
    <div className="rounded-control border border-border-subtle bg-surface-muted/60 px-4 py-3 font-mono text-body-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
      <p className="text-[11px] font-sans font-semibold uppercase tracking-wide text-foreground-muted">План</p>
      <p className="mt-2 text-foreground">{block.summary}</p>
      {block.intent ? <p className="mt-1 text-foreground-secondary">Намерение: {block.intent}</p> : null}
      {block.tables && block.tables.length > 0 ? (
        <p className="mt-2 text-xs text-foreground-secondary">
          Таблицы: <span className="text-foreground">{block.tables.join(", ")}</span>
        </p>
      ) : null}
    </div>
  );
}
