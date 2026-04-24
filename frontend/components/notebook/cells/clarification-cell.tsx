import type { ClarificationCellProps } from "@/lib/notebook/block-types";
import { clarificationReasonSummaryRu } from "@/lib/notebook/clarification-copy";
import { UiStateSurface } from "@/components/ui/state-surface";

export function ClarificationCell({ block, onSelectOption, disabled = false }: ClarificationCellProps) {
  const reasonText =
    (block.reasonSummaryRu && block.reasonSummaryRu.trim()) ||
    (block.reasonCode ? clarificationReasonSummaryRu(block.reasonCode) : "");
  return (
    <div className="surface-decision border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-surface-card px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">Нужно уточнение</p>
      {reasonText ? (
        <p className="mt-2 text-xs leading-relaxed text-foreground-secondary">
          <span className="font-semibold text-foreground">Почему неоднозначно: </span>
          {reasonText}
        </p>
      ) : null}
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Вопрос</p>
        <p className="mt-1 text-sm font-medium text-foreground">{block.prompt}</p>
      </div>
      {block.options && block.options.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {block.options.map((opt) => {
            const selected = opt.id === block.selectedOptionId;
            return (
              <button
                type="button"
                key={opt.id}
                disabled={disabled}
                onClick={() => onSelectOption?.(opt.id, opt.label)}
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
      ) : (
        <div className="mt-3">
          <UiStateSurface
            variant="ambiguity"
            title="Варианты ответа не переданы"
            description="Система запросила уточнение, но список вариантов пуст. Сформулируйте ответ в композере внизу или перезапустите промпт."
            dense
          />
        </div>
      )}
    </div>
  );
}
