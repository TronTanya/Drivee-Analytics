"use client";

import { useEffect } from "react";
import type { NotebookCanvasProps } from "@/lib/notebook/block-types";

export function NotebookCanvas({
  children,
  trace,
  traceOpen,
  traceWidthClassName = "w-full xl:w-[360px]"
}: NotebookCanvasProps) {
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1279px)");
    if (!(traceOpen && mq.matches)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [traceOpen]);

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 space-y-6">{children}</div>
      {traceOpen ? (
        <>
          <aside className={`hidden shrink-0 xl:sticky xl:top-24 xl:block xl:max-h-[calc(100vh-7rem)] ${traceWidthClassName}`}>
            {trace}
          </aside>
          <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center bg-slate-950/35 p-2 xl:hidden">
            <div className="pointer-events-auto max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-card shadow-modal">
              {trace}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
