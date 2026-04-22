import type { Route } from "next";
import Link from "next/link";

export type DemoQuickActionItem = {
  label: string;
  href: string;
  hint?: string;
};

export function DemoQuickActions({
  title = "Быстрые действия",
  items,
  className = ""
}: {
  title?: string;
  items: DemoQuickActionItem[];
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-border-subtle bg-surface-card px-4 py-3 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{title}</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {items.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href as Route}
            title={item.hint}
            className="inline-flex shrink-0 items-center rounded-full border border-border-subtle bg-[#f7f8f4] px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-surface-muted"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
