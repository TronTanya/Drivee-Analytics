import type { ReactNode } from "react";

export function SectionCard({
  title,
  description,
  action,
  children,
  className = ""
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`surface-section ${className}`.trim()}
    >
      <div className="flex flex-col gap-1 border-b border-border-subtle/80 bg-surface-muted/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-heading-3 text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-foreground-secondary">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
