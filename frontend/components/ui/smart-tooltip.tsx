"use client";

import { type FocusEvent, type ReactNode, useCallback, useRef, useState } from "react";

type SmartTooltipProps = {
  children: ReactNode;
  content: ReactNode;
  estimatedWidth?: number;
  panelWidthClassName?: string;
};

export function SmartTooltip({
  children,
  content,
  estimatedWidth = 224,
  panelWidthClassName = "w-56"
}: SmartTooltipProps) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const recalcPosition = useCallback(() => {
    if (!wrapperRef.current || typeof window === "undefined") return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const overflowsRight = rect.left + estimatedWidth > window.innerWidth - viewportPadding;
    setAlignRight(overflowsRight);
  }, [estimatedWidth]);

  const openTooltip = useCallback(() => {
    recalcPosition();
    setOpen(true);
  }, [recalcPosition]);

  const closeTooltip = useCallback(() => {
    setOpen(false);
  }, []);

  const onBlurCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const nextFocused = event.relatedTarget;
    if (!nextFocused || !event.currentTarget.contains(nextFocused as Node)) {
      setOpen(false);
    }
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={openTooltip}
      onMouseLeave={closeTooltip}
      onFocusCapture={openTooltip}
      onBlurCapture={onBlurCapture}
    >
      {children}
      <div
        role="tooltip"
        className={`pointer-events-none absolute top-full z-20 mt-2 rounded-control border border-border-subtle bg-surface-card p-2 text-[11px] text-foreground-secondary shadow-soft transition-all duration-150 motion-reduce:transform-none motion-reduce:transition-none ${
          open ? "visible translate-y-0 opacity-100" : "invisible -translate-y-0.5 opacity-0"
        } ${panelWidthClassName} ${alignRight ? "right-0 left-auto" : "left-0"}`}
      >
        <span
          aria-hidden="true"
          className={`absolute -top-1.5 h-2.5 w-2.5 rotate-45 border-l border-t border-border-subtle bg-surface-card transition-all duration-150 motion-reduce:transition-none motion-reduce:transform-none ${
            open ? "scale-100 opacity-100" : "scale-75 opacity-0"
          } ${
            alignRight ? "right-3" : "left-3"
          }`}
        />
        {content}
      </div>
    </div>
  );
}

