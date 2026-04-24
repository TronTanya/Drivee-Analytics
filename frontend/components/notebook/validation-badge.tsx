import type { ValidationBadgeProps } from "@/lib/notebook/block-types";

export function ValidationBadge({ ok, label, className = "", compact = false, danger = false }: ValidationBadgeProps) {
  const text = label ?? (ok ? "Проверено" : "Проблемы");
  const styles = ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : danger
      ? "border-danger/40 bg-danger-soft text-danger-bold"
      : "border-amber-200 bg-amber-50 text-amber-900";

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ${styles} ${className}`}
      >
        <span aria-hidden>{ok ? "✓" : "!"}</span>
        <span className="max-w-[9rem] truncate">{text}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ${styles} ${className}`}
    >
      <span aria-hidden>{ok ? "✓" : "!"}</span>
      {text}
    </span>
  );
}
