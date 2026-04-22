import type { Route } from "next";
import Link from "next/link";
import type { ListItem } from "@/lib/dashboard/mock-data";

export function RecentLinksList({ items }: { items: ListItem[] }) {
  return (
    <ul className="divide-y divide-border-subtle">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href as Route}
            className="interactive-focus flex flex-col gap-0.5 rounded-control px-2 py-3 transition first:pt-0 last:pb-0 hover:bg-surface-muted hover:text-brand-800"
          >
            <span className="text-sm font-medium text-foreground">{item.title}</span>
            <span className="text-xs text-foreground-muted">{item.meta}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
