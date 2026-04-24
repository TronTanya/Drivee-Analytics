import type { RunCellButtonProps } from "@/lib/notebook/block-types";

export function RunCellButton({
  onClick,
  loading,
  disabled,
  label = "Запуск"
}: RunCellButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className="interactive-focus flex w-full items-center justify-center gap-1.5 rounded-control border border-border-subtle bg-surface-card px-2.5 py-1 text-xs font-semibold text-foreground-secondary shadow-xs transition hover:border-brand-200 hover:bg-brand-50/40 hover:text-brand-800 active:scale-[0.98] disabled:opacity-50 sm:inline-flex sm:w-auto"
    >
      {loading ? (
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" aria-hidden />
      ) : (
        <span className="text-brand-600" aria-hidden>
          ▶
        </span>
      )}
      {loading ? "Выполняется…" : label}
    </button>
  );
}
