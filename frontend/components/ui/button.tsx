import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  loading?: boolean;
  /** Shown next to spinner when `loading` is true */
  loadingLabel?: string;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    loading = false,
    loadingLabel = "Пожалуйста, подождите…",
    disabled,
    className = "",
    children,
    type = "button",
    ...props
  },
  ref
) {
  const base =
    "interactive-focus inline-flex items-center justify-center gap-2 rounded-control px-4 py-2.5 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-55";
  const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
    primary: "micro-lift bg-brand-500 text-black shadow-xs hover:bg-brand-400 active:translate-y-0",
    secondary:
      "border border-border-subtle bg-surface-card text-foreground shadow-xs hover:bg-surface-muted",
    ghost: "text-foreground-secondary hover:bg-surface-muted hover:text-foreground"
  };

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${variants[variant]} active:scale-[0.99] ${className}`.trim()}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
