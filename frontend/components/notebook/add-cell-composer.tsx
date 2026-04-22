import type { AddCellComposerProps } from "@/lib/notebook/block-types";
import { Button } from "@/components/ui/button";

export function AddCellComposer({
  value,
  onChange,
  onSubmit,
  disabled,
  loading,
  placeholder = "Задайте вопрос на естественном языке - сценарий спланирует SQL, графики и narrative…",
  error
}: AddCellComposerProps) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-card p-4 shadow-soft">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Новый промпт</span>
        <span className="hidden text-[11px] text-foreground-muted sm:inline">Enter - отправить · Shift+Enter - новая строка</span>
      </div>
      <textarea
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
      {error ? <p className="mt-2 text-xs font-medium text-danger">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
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
