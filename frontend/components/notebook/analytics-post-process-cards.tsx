"use client";

import type { ReactNode } from "react";
import type { AnalyticsSqlPostProcessSnapshot } from "@/lib/notebook/analytics-sql-post-process";
import { ANALYTICS_FORECAST_INSUFFICIENT_RU } from "@/lib/notebook/analytics-sql-post-process";

function cardShell(title: string, accent: "violet" | "sky" | "amber", children: ReactNode) {
  const ring =
    accent === "violet"
      ? "border-violet-500/25 bg-violet-500/[0.04]"
      : accent === "sky"
        ? "border-sky-500/25 bg-sky-500/[0.04]"
        : "border-amber-500/30 bg-amber-500/[0.05]";
  return (
    <div className={`rounded-control border px-3 py-2.5 ${ring}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{title}</p>
      <div className="mt-1.5 text-sm text-foreground">{children}</div>
    </div>
  );
}

export type AnalyticsPostProcessCardsProps = {
  snapshot: AnalyticsSqlPostProcessSnapshot;
};

export function AnalyticsPostProcessCards({ snapshot }: AnalyticsPostProcessCardsProps) {
  const { insights, forecast, anomalies } = snapshot;
  const sufficient = forecast.sufficient_data === true;
  const summary = typeof forecast.summary === "string" ? forecast.summary.trim() : "";
  const forecastText = sufficient
    ? summary || "Прогноз по тренду рассчитан; подробности см. в ответе API (delta_pct)."
    : typeof forecast.note_ru === "string" && forecast.note_ru.trim()
      ? String(forecast.note_ru).trim()
      : ANALYTICS_FORECAST_INSUFFICIENT_RU;

  const insightText =
    insights.length > 0 ? (
      <ul className="list-inside list-disc space-y-1 text-foreground-secondary">
        {insights.map((line, i) => (
          <li key={`ins-${i}`}>{line}</li>
        ))}
      </ul>
    ) : (
      <p className="text-foreground-secondary">Авто-инсайт по таблице не сформирован (мало строк или нет подходящей числовой метрики).</p>
    );

  const anomalyBlocks =
    anomalies.length > 0 ? (
      <ul className="space-y-2">
        {anomalies.map((a, i) => {
          const msg =
            typeof a.message_ru === "string" && a.message_ru.trim()
              ? a.message_ru.trim()
              : `Сегмент «${String(a.segment ?? "")}» (измерение ${String(a.dimension ?? "")}): z=${String(a.z_score ?? "")}`;
          return (
            <li key={`anom-${i}`} className="text-foreground-secondary">
              {msg}
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="text-foreground-secondary">Сильных отклонений по сегментам (|z| ≥ 2) не найдено.</p>
    );

  return (
    <section className="space-y-2" aria-label="Аналитика по таблице результата">
      <h3 className="text-xs font-semibold text-foreground-muted">Аналитика по результату SQL</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        {cardShell("Insight", "violet", insightText)}
        {cardShell("Forecast", "sky", <p className="text-foreground-secondary">{forecastText}</p>)}
        {cardShell("Anomaly", "amber", anomalyBlocks)}
      </div>
    </section>
  );
}
