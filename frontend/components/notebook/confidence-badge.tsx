import type { ConfidenceBadgeProps } from "@/lib/notebook/block-types";

export function ConfidenceBadge({ value, className = "" }: ConfidenceBadgeProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tone =
    pct >= 85
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : pct >= 65
        ? "border-brand-200 bg-brand-50 text-brand-900"
        : "border-amber-200 bg-amber-50 text-amber-900";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] ${tone} ${className}`}
      title="Уверенность модели"
    >
      <span className="opacity-90">Уверенность</span>
      <span className="tabular-nums">{pct}%</span>
    </span>
  );
}
