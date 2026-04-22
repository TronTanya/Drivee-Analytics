import type { ReactNode } from "react";

export function FormField({
  id,
  label,
  error,
  hint,
  children
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-foreground-muted">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
