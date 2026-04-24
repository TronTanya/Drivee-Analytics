export function SystemPageIntro({
  title,
  subtitle
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <header className="surface-hero px-5 py-5 sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-foreground-secondary">Платформа</p>
      <h1 className="text-heading-1 text-foreground">{title}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground-secondary">{subtitle}</p>
    </header>
  );
}
