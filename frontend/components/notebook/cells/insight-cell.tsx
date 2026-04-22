import type { InsightCellProps } from "@/lib/notebook/block-types";
import { ConfidenceBadge } from "@/components/notebook/confidence-badge";

export function InsightCell({ block }: InsightCellProps) {
  return (
    <div className="surface-decision relative overflow-hidden border-border-subtle bg-surface-card px-4 py-4">
      <div className="absolute left-0 top-0 h-full w-1 bg-[#d6ff63]" aria-hidden />
      <div className="pl-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-secondary">Инсайт</p>
          {typeof block.confidence === "number" ? <ConfidenceBadge value={block.confidence} /> : null}
        </div>
        <h3 className="mt-1 text-heading-3 text-foreground">{block.title}</h3>
        {block.summary ? <p className="mt-2 text-sm text-foreground-secondary">{block.summary}</p> : null}
        <ul className="mt-3 space-y-1.5 text-sm text-foreground">
          {block.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#9fd228]" aria-hidden />
              <span className="leading-relaxed">{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
