import type { Route } from "next";
import Link from "next/link";

export function CtaNotebookBanner({
  title,
  description,
  href,
  label
}: {
  title: string;
  description: string;
  href: Route;
  label: string;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 rounded-card border border-border-subtle bg-surface-card px-5 py-4 sm:flex-row sm:items-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">{title}</p>
        <p className="mt-1 text-sm text-foreground-secondary">{description}</p>
      </div>
      <Link
        href={href}
        className="inline-flex w-full shrink-0 items-center justify-center rounded-control bg-brand-500 px-4 py-2.5 text-sm font-semibold text-black shadow-xs transition hover:bg-brand-400 sm:w-auto"
      >
        {label}
      </Link>
    </div>
  );
}
