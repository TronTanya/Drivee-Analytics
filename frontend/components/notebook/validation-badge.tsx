import type { ValidationBadgeProps } from "@/lib/notebook/block-types";

export function ValidationBadge({ ok, label, className = "" }: ValidationBadgeProps) {
  const text = label ?? (ok ? "Проверено" : "Проблемы");
  const styles = ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ${styles} ${className}`}
    >
      <span aria-hidden>{ok ? "✓" : "!"}</span>
      {text}
    </span>
  );
}
