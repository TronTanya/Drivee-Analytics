"use client";

import { useMemo, useState } from "react";
import { useRunForecast, useRunForecastAutoMLBacktest } from "@/hooks/api";
import { setPreferredForecastStrategy } from "@/lib/preferences/forecast-automl";
import { Button } from "@/components/ui/button";
import { SmartTooltip } from "@/components/ui/smart-tooltip";

type BulkResult = { metric: string; strategy: string; status: "ok" | "error" };
type AutoMLBulkApplyCardProps = {
  compact?: boolean;
};
type BulkRunSummary = {
  ts: number;
  total: number;
  ok: number;
};

const DEFAULT_WORKSPACE_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_SOURCE_TABLE = "public.train";
const DEFAULT_DATE_COLUMN = "order_timestamp";
const LAST_RUN_KEY = "drivee.automl.bulk.last.v1";

function readLastRunSummary(workspaceId: string): BulkRunSummary | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_RUN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, BulkRunSummary>;
    return parsed?.[workspaceId] ?? null;
  } catch {
    return null;
  }
}

function writeLastRunSummary(workspaceId: string, summary: BulkRunSummary) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LAST_RUN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, BulkRunSummary>) : {};
    parsed[workspaceId] = summary;
    window.localStorage.setItem(LAST_RUN_KEY, JSON.stringify(parsed));
  } catch {
    // ignore storage errors
  }
}

function successRatePercent(summary: BulkRunSummary): number {
  return Math.round((summary.ok / Math.max(1, summary.total)) * 100);
}

function successRateBadgeClass(percent: number): string {
  if (percent >= 85) return "border border-emerald-300 bg-emerald-50 text-emerald-800";
  if (percent >= 60) return "border border-amber-300 bg-amber-50 text-amber-800";
  return "border border-rose-300 bg-rose-50 text-rose-800";
}

export function AutoMLBulkApplyCard({ compact = false }: AutoMLBulkApplyCardProps) {
  const [workspaceId, setWorkspaceId] = useState(DEFAULT_WORKSPACE_ID);
  const [sourceTable] = useState(DEFAULT_SOURCE_TABLE);
  const [dateColumn] = useState(DEFAULT_DATE_COLUMN);
  const [horizonDays] = useState(14);
  const [holdoutDays] = useState(14);
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [lastRunSummary, setLastRunSummary] = useState<BulkRunSummary | null>(() => readLastRunSummary(DEFAULT_WORKSPACE_ID));

  const runBacktest = useRunForecastAutoMLBacktest();
  const runForecast = useRunForecast();

  const isBusy = runBacktest.isPending || runForecast.isPending;

  const bestModels = useMemo(() => {
    const leaderboards = runBacktest.data?.leaderboards ?? [];
    return leaderboards
      .map((lb) => ({ metric: lb.metric_key, strategy: lb.best_strategy }))
      .filter((x): x is { metric: string; strategy: string } => Boolean(x.strategy));
  }, [runBacktest.data]);

  async function runAll() {
    if (isBusy) return;
    setMessage("Запускаю AutoML backtest...");
    setResults([]);

    try {
      const backtest = await runBacktest.mutateAsync({
        workspace_id: workspaceId,
        source_table: sourceTable,
        date_column: dateColumn,
        horizon_days: horizonDays,
        holdout_days: holdoutDays,
        strategies: ["linear_regression", "trend_extrapolation", "rolling_average"]
      });

      const targets = (backtest.leaderboards ?? [])
        .map((lb) => ({ metric: lb.metric_key, strategy: lb.best_strategy }))
        .filter((x): x is { metric: string; strategy: string } => Boolean(x.strategy));

      if (targets.length === 0) {
        setMessage("Не найдено подходящих best strategy для применения.");
        return;
      }

      setMessage("Применяю лучшие модели в production...");
      const applied: BulkResult[] = [];
      for (const target of targets) {
        setPreferredForecastStrategy(workspaceId, target.metric, target.strategy);
        try {
          await runForecast.mutateAsync({
            workspace_id: workspaceId,
            source_table: sourceTable,
            date_column: dateColumn,
            horizon_days: horizonDays,
            preferred_strategy: target.strategy
          });
          applied.push({ metric: target.metric, strategy: target.strategy, status: "ok" });
        } catch {
          applied.push({ metric: target.metric, strategy: target.strategy, status: "error" });
        }
      }

      setResults(applied);
      const okCount = applied.filter((x) => x.status === "ok").length;
      const runSummary: BulkRunSummary = { ts: Date.now(), total: applied.length, ok: okCount };
      setLastRunSummary(runSummary);
      writeLastRunSummary(workspaceId, runSummary);
      setMessage(`Готово: ${okCount}/${applied.length} моделей применено.`);
    } catch {
      setMessage("Не удалось выполнить AutoML пакет. Проверьте доступ к данным и авторизацию.");
    }
  }

  return (
    <section className="surface-section p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">AutoML Fast Apply</p>
          <h3 className="mt-1 text-base font-semibold text-foreground">Set default + Run production (dashboard)</h3>
          {!compact ? (
            <p className="mt-1 text-sm text-foreground-secondary">
              One-click pipeline: backtest, выбор best strategy и применение в production forecast.
            </p>
          ) : null}
        </div>
        <Button loading={isBusy} loadingLabel="Выполняю пакет..." onClick={() => void runAll()}>
          Запустить пакет
        </Button>
      </div>

      {!compact ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase text-foreground-muted">Workspace ID</span>
            <input
              value={workspaceId}
              onChange={(e) => {
                const next = e.target.value;
                setWorkspaceId(next);
                setLastRunSummary(readLastRunSummary(next));
              }}
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2"
            />
          </label>
          <div className="rounded-control border border-border-subtle bg-surface-page px-3 py-2 text-xs text-foreground-secondary">
            {bestModels.length > 0 ? `Best strategies: ${bestModels.length}` : "Best strategies: pending"}
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-1 text-xs text-foreground-secondary">
          <p>{bestModels.length > 0 ? `Best strategies ready: ${bestModels.length}` : "Best strategies will appear after run."}</p>
          {lastRunSummary ? (
            <div className="flex flex-wrap items-center gap-2">
              <span>Last run: {new Date(lastRunSummary.ts).toLocaleString("ru-RU")}</span>
              <SmartTooltip
                estimatedWidth={256}
                panelWidthClassName="w-64"
                content={
                  <>
                    <p className="font-semibold text-foreground">AutoML пакет</p>
                    <p className="mt-1">Успешно: {lastRunSummary.ok}/{lastRunSummary.total}</p>
                    <p className="mt-1">Пороги: green &gt;= 85%, yellow 60-84%, red &lt; 60%</p>
                  </>
                }
              >
                <button
                  type="button"
                  aria-label="Подробнее о success rate"
                  className={`interactive-focus rounded-full px-2 py-0.5 text-[11px] font-semibold ${successRateBadgeClass(successRatePercent(lastRunSummary))}`}
                >
                  success rate: {successRatePercent(lastRunSummary)}%
                </button>
              </SmartTooltip>
            </div>
          ) : null}
        </div>
      )}

      {message ? <p className="mt-3 text-sm text-foreground-secondary">{message}</p> : null}
      {!compact && results.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {results.map((r) => (
            <div key={`${r.metric}-${r.strategy}`} className="rounded-control border border-border-subtle bg-surface-page px-3 py-2 text-xs">
              <span className="font-semibold text-foreground">{r.metric}</span>{" "}
              <span className="text-foreground-secondary">({r.strategy})</span>:{" "}
              <span className={r.status === "ok" ? "text-brand-700" : "text-danger"}>
                {r.status === "ok" ? "applied" : "failed"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

