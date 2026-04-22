type AlertVariant = "error" | "success" | "info";

const styles: Record<AlertVariant, string> = {
  error: "border-danger/20 bg-danger-soft text-danger-bold",
  success: "border-brand-200 bg-brand-50 text-brand-800",
  info: "border-border-subtle bg-surface-muted text-foreground-secondary"
};

export function InlineAlert({
  variant,
  title,
  children
}: {
  variant: AlertVariant;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex gap-3 rounded-control border px-4 py-3 text-sm ${styles[variant]}`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden>
        {variant === "error" ? "!" : variant === "success" ? "✓" : "i"}
      </span>
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold text-foreground">{title}</p> : null}
        <div className="leading-snug">{children}</div>
      </div>
    </div>
  );
}
