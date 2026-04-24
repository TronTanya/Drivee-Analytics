"use client";

import type { ReactNode } from "react";

export type UiStateVariant = "loading" | "empty" | "error" | "success" | "ambiguity";

const shellClass: Record<UiStateVariant, string> = {
  loading: "enterprise-state-loading",
  empty: "enterprise-state-empty",
  error: "enterprise-state-error",
  success: "enterprise-state-success",
  ambiguity: "enterprise-state-ambiguity"
};

export function UiStateSurface({
  variant,
  title,
  description,
  icon,
  children,
  dense = false,
  className = ""
}: {
  variant: UiStateVariant;
  title: string;
  description?: string;
  icon?: ReactNode;
  children?: ReactNode;
  /** Компактная полоса (например поверх контента) без skeleton-блоков. */
  dense?: boolean;
  className?: string;
}) {
  return (
    <div className={`${shellClass[variant]} ${className}`.trim()} role={variant === "loading" ? "status" : undefined}>
      <div className="flex gap-3">
        {icon ? (
          <div className="mt-0.5 shrink-0 text-foreground-muted [&>svg]:block [&>svg]:h-7 [&>svg]:w-7" aria-hidden>
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={dense ? "text-sm font-semibold text-foreground" : "text-heading-3 text-foreground"}>{title}</p>
          {description ? (
            <p className={`text-foreground-secondary ${dense ? "mt-0.5 text-xs" : "mt-1 text-sm leading-relaxed"}`}>
              {description}
            </p>
          ) : null}
          {variant === "loading" && !dense ? <LoadingSkeletonLines /> : null}
          {children}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeletonLines() {
  return (
    <div className="mt-3 space-y-2" aria-hidden>
      <div className="h-2.5 w-full max-w-md animate-pulse rounded-full bg-border-subtle/90" />
      <div className="h-2.5 w-[82%] max-w-sm animate-pulse rounded-full bg-border-subtle/80" />
      <div className="h-2.5 w-[58%] max-w-xs animate-pulse rounded-full bg-border-subtle/70" />
    </div>
  );
}
