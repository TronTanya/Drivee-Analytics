import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "brand" | "warning" | "danger" | "success" | "info";

const toneClass: Record<BadgeTone, string> = {
  neutral: "border-border-subtle bg-surface-muted text-foreground-secondary",
  brand: "border-brand-200/90 bg-brand-50 text-brand-900",
  warning: "border-amber-200/90 bg-warning-soft text-warning-bold",
  danger: "border-danger/25 bg-danger-soft text-danger-bold",
  success: "border-emerald-200/90 bg-success-soft text-success-bold",
  info: "border-sky-200/80 bg-info-soft text-info-bold"
};

export function Badge({
  tone = "neutral",
  children,
  className = ""
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${toneClass[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
