import type { Route } from "next";
import Link from "next/link";
import type { AdminTile } from "@/lib/dashboard/mock-data";

export function AdminTilesGrid({ tiles }: { tiles: AdminTile[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((tile) => (
        <Link
          key={tile.id}
          href={tile.href as Route}
          className="group flex flex-col rounded-card border border-border-subtle bg-surface-card p-4 shadow-xs transition hover:border-brand-200 hover:shadow-soft"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-foreground group-hover:text-brand-800">{tile.title}</h3>
            {tile.tag ? (
              <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground-secondary">
                {tile.tag}
              </span>
            ) : null}
          </div>
          <p className="mt-2 flex-1 text-xs leading-relaxed text-foreground-secondary">{tile.description}</p>
          <span className="mt-3 text-[11px] font-semibold text-brand-700">Открыть →</span>
        </Link>
      ))}
    </div>
  );
}
