import type { Route } from "next";
import Link from "next/link";
import type { PromptChip } from "@/lib/dashboard/mock-data";

export function QuickPrompts({ items }: { items: PromptChip[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => (
        <Link
          key={p.id}
          href={p.href as Route}
          className="interactive-focus rounded-full border border-border-subtle bg-surface-page px-3 py-1.5 text-xs font-medium text-foreground shadow-xs transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-900"
        >
          {p.label}
        </Link>
      ))}
    </div>
  );
}
