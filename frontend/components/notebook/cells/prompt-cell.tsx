import type { PromptCellProps } from "@/lib/notebook/block-types";
import { Button } from "@/components/ui/button";

export function PromptCell({ block, onChange, onSubmit, disabled }: PromptCellProps) {
  return (
    <div className="rounded-control border border-border-subtle bg-gradient-to-br from-surface-page to-surface-card px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Промпт</p>
        {onSubmit ? <span className="text-[11px] text-foreground-muted">Enter - запустить · Shift+Enter - новая строка</span> : null}
      </div>
      {onChange ? (
        <>
          <textarea
            value={block.text}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              const isEnter = e.key === "Enter" || e.code === "NumpadEnter";
              if (e.nativeEvent.isComposing) return;
              if (isEnter && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && onSubmit) {
                e.preventDefault();
                if (!disabled && block.text.trim()) onSubmit(block.text);
              }
            }}
            className="interactive-focus mt-2 min-h-[72px] w-full resize-y rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-sm leading-relaxed text-foreground"
          />
          {onSubmit ? (
            <div className="mt-2 flex justify-end">
              <Button type="button" onClick={() => onSubmit(block.text)} disabled={disabled || !block.text.trim()} className="px-4 py-1.5 text-xs">
                Запустить этот промпт
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{block.text}</p>
      )}
    </div>
  );
}
