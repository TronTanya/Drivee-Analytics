export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-foreground sm:text-2xl">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-foreground-secondary">{subtitle}</p> : null}
    </section>
  );
}
