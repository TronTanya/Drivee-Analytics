import type { ClarificationCellProps } from "@/lib/notebook/block-types";

export function ClarificationCell({ block, onSelectOption, disabled = false }: ClarificationCellProps) {
  return (
    <div className="surface-decision border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-surface-card px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">Нужно уточнение</p>
      <p className="mt-2 text-sm font-medium text-foreground">{block.prompt}</p>
      {block.options && block.options.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {block.options.map((opt) => {
            const selected = opt.id === block.selectedOptionId;
            return (
              <button
                type="button"
                key={opt.id}
                disabled={disabled}
                onClick={() => onSelectOption?.(opt.id)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                  selected
                    ? "border-brand-400 bg-brand-50 text-brand-900 shadow-xs"
                    : "border-border-subtle bg-surface-card text-foreground-secondary hover:border-brand-200 hover:text-foreground"
                } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
