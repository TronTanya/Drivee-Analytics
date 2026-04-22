import type { RunAllButtonProps } from "@/lib/notebook/block-types";

export function RunAllButton({ onClick, loading, disabled }: RunAllButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className="interactive-focus micro-lift inline-flex items-center gap-2 rounded-control bg-brand-500 px-3 py-2 text-xs font-semibold text-black shadow-xs transition hover:bg-brand-400 active:translate-y-0 disabled:opacity-50"
    >
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden />
      ) : null}
      {loading ? "Выполняю сценарий…" : "Запустить все"}
    </button>
  );
}
