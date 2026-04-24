import type { Route } from "next";
import Link from "next/link";

export function AuthPageIntro({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  /** Необязательный подзаголовок под формой входа/регистрации. */
  description?: string;
}) {
  return (
    <header className="space-y-3 text-center sm:text-left">
      <Link
        href={"/" as Route}
        className="inline-flex text-xs font-semibold uppercase tracking-wider text-foreground-secondary hover:text-foreground"
      >
        ← На главную Drivee Analytics Notebook
      </Link>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{eyebrow}</p>
        <h1 className="mt-1 text-heading-1 text-foreground">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-md text-sm leading-relaxed text-foreground-secondary">{description}</p>
        ) : null}
      </div>
    </header>
  );
}
