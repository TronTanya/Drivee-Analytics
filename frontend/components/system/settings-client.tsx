"use client";

import { useMemo, useState } from "react";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { getDefaultReportPdfMode, setDefaultReportPdfMode, type ReportPdfMode } from "@/lib/preferences/report-pdf";

const LABEL: Record<ReportPdfMode, string> = {
  compact: "Compact (краткий)",
  board: "Board (executive)"
};

export function SettingsClient() {
  const [mode, setMode] = useState<ReportPdfMode>(() => getDefaultReportPdfMode());
  const [saved, setSaved] = useState(false);

  const helpText = useMemo(
    () =>
      mode === "board"
        ? "Board-режим делает расширенный executive PDF с секциями и KPI."
        : "Compact-режим делает более короткий и плотный PDF для быстрого просмотра.",
    [mode]
  );

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title="Настройки"
        subtitle="Персональные параметры интерфейса и экспорта."
      />

      <section className="rounded-card border border-border-subtle bg-surface-card p-5 shadow-xs">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">PDF по умолчанию</p>
        <p className="mt-1 text-sm text-foreground-secondary">
          Выберите режим, который будет использоваться кнопкой “PDF по умолчанию” в отчетах и сценариях.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["compact", "board"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setSaved(false);
                setMode(m);
              }}
              className={`rounded-control border px-3 py-2 text-xs font-semibold ${
                mode === m
                  ? "border-brand-300 bg-brand-50 text-brand-900"
                  : "border-border-subtle bg-surface-card text-foreground-secondary hover:bg-surface-muted"
              }`}
            >
              {LABEL[m]}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-foreground-muted">{helpText}</p>

        <button
          type="button"
          onClick={() => {
            setDefaultReportPdfMode(mode);
            setSaved(true);
          }}
          className="mt-4 rounded-control border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
        >
          Сохранить настройку
        </button>

        {saved ? <p className="mt-2 text-xs text-emerald-800">Сохранено.</p> : null}
      </section>
    </div>
  );
}
