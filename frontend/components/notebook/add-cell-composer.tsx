import { useMemo } from "react";
import type { AddCellComposerProps } from "@/lib/notebook/block-types";
import { Button } from "@/components/ui/button";
import { getPromptSuggestions } from "@/lib/notebook/prompt-suggestions";

export function AddCellComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  loading,
  placeholder = "Задайте вопрос на естественном языке - сценарий спланирует SQL, графики и narrative…",
  error,
  containerRef,
  textareaRef
}: AddCellComposerProps) {
  const suggestions = useMemo(() => getPromptSuggestions(value), [value]);

  return (
    <div
      ref={containerRef}
      className="rounded-card border border-border-subtle bg-surface-card p-4 shadow-soft"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Новый промпт</span>
        <span className="hidden text-[11px] text-foreground-muted sm:inline">Enter - отправить · Shift+Enter - новая строка</span>
      </div>
      <textarea
        ref={textareaRef}
        data-testid="notebook-prompt-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          const isEnter = e.key === "Enter" || e.code === "NumpadEnter";
          if (e.nativeEvent.isComposing) return;
          if (isEnter && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            if (!disabled && !loading && value.trim()) onSubmit();
          }
        }}
        disabled={disabled || loading}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-y rounded-control border border-border-subtle bg-surface-page px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:opacity-60"
      />
      {suggestions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(suggestion)}
              className="rounded-full border border-border-subtle bg-surface-page px-3 py-1 text-[11px] text-foreground-muted transition hover:border-brand-300 hover:text-foreground"
              disabled={disabled || loading}
              title="Подставить подсказку по смыслу"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-danger">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          data-testid="notebook-submit-prompt"
          onClick={onSubmit}
          disabled={disabled || loading || !value.trim()}
          loading={loading}
          loadingLabel="Отправка…"
          className="w-full px-5 sm:w-auto"
        >
          Добавить и запустить
        </Button>
      </div>
    </div>
  );
}
