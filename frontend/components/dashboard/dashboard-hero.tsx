import type { ReactNode } from "react";

export function DashboardHero({
  eyebrow,
  title,
  description,
  trailing
}: {
  eyebrow: string;
  title: string;
  description: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="surface-hero px-5 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground-secondary">{eyebrow}</p>
          <h1 className="text-heading-1 tracking-tight text-foreground">{title}</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-foreground-secondary">{description}</p>
        </div>
        {trailing ? <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:justify-end">{trailing}</div> : null}
      </div>
    </header>
  );
}
