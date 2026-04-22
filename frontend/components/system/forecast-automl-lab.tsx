"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { Button } from "@/components/ui/button";
import { useRunForecast, useRunForecastAutoMLBacktest } from "@/hooks/api";
import { getPreferredForecastStrategy, setPreferredForecastStrategy } from "@/lib/preferences/forecast-automl";

const STRATEGIES = [
  { key: "linear_regression", label: "Linear Regression" },
  { key: "trend_extrapolation", label: "Trend Extrapolation" },
  { key: "rolling_average", label: "Rolling Average" }
] as const;

export function ForecastAutoMLLab() {
  const [workspaceId, setWorkspaceId] = useState("00000000-0000-0000-0000-000000000001");
  const [sourceTable, setSourceTable] = useState("public.anonymized_incity_orders");
  const [dateColumn, setDateColumn] = useState("order_timestamp");
  const [horizonDays, setHorizonDays] = useState(14);
  const [holdoutDays, setHoldoutDays] = useState(14);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>(STRATEGIES.map((s) => s.key));
  const [preferredByMetric, setPreferredByMetric] = useState<Partial<Record<string, string>>>({});

  const runBacktest = useRunForecastAutoMLBacktest();
  const runForecast = useRunForecast();
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [isBulkApplying, setIsBulkApplying] = useState(false);
  const [bulkDetails, setBulkDetails] = useState<Array<{ metric: string; strategy: string; status: "ok" | "error" }>>([]);

  useEffect(() => {
    const lb = runBacktest.data?.leaderboards ?? [];
    const next: Partial<Record<string, string>> = {};
    for (const item of lb) {
      const preferred = getPreferredForecastStrategy(workspaceId, item.metric_key);
      if (preferred) next[item.metric_key] = preferred;
    }
    setPreferredByMetric(next);
  }, [runBacktest.data, workspaceId]);

  const summary = useMemo(() => {
    const lb = runBacktest.data?.leaderboards ?? [];
    return lb
      .map((x) => ({
        metric: x.metric_key,
        best: x.best_strategy ?? null,
        score: x.best_score,
        preferred: preferredByMetric[x.metric_key] ?? null
      }))
      .filter((x): x is { metric: string; best: string; score: number | null | undefined; preferred: string | null } => Boolean(x.best));
  }, [preferredByMetric, runBacktest.data]);

  function toggleStrategy(key: string) {
    setSelectedStrategies((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }

  async function applyAllBestModels() {
    if (summary.length === 0 || isBulkApplying) return;
    setIsBulkApplying(true);
    setBulkDetails([]);
    setApplyMessage("Применяю лучшие модели по всем метрикам...");
    const results: Array<{ metric: string; strategy: string; status: "ok" | "error" }> = [];

    for (const item of summary) {
      const strategy = item.best;
      setPreferredForecastStrategy(workspaceId, item.metric, strategy);
      setPreferredByMetric((prev) => ({ ...prev, [item.metric]: strategy }));
      try {
        await runForecast.mutateAsync({
          workspace_id: workspaceId,
          source_table: sourceTable,
          date_column: dateColumn,
          horizon_days: horizonDays,
          preferred_strategy: strategy
        });
        results.push({ metric: item.metric, strategy, status: "ok" });
      } catch {
        results.push({ metric: item.metric, strategy, status: "error" });
      }
    }

    setBulkDetails(results);
    const okCount = results.filter((r) => r.status === "ok").length;
    const errCount = results.length - okCount;
    setApplyMessage(`Готово: ${okCount} успешно, ${errCount} с ошибкой.`);
    setIsBulkApplying(false);
  }

  function asNumber(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title="AutoML & Backtesting Lab"
        subtitle="Подбор стратегии прогноза по метрикам с лидербордом моделей, backtest-метриками и preview будущих точек."
      />

      <section className="surface-section p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Параметры эксперимента</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase text-foreground-muted">Workspace ID</span>
            <input
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase text-foreground-muted">Source Table</span>
            <input
              value={sourceTable}
              onChange={(e) => setSourceTable(e.target.value)}
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-semibold uppercase text-foreground-muted">Date Column</span>
            <input
              value={dateColumn}
              onChange={(e) => setDateColumn(e.target.value)}
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase text-foreground-muted">Horizon (days)</span>
              <input
                type="number"
                min={1}
                max={90}
                value={horizonDays}
                onChange={(e) => setHorizonDays(Number(e.target.value))}
                className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="text-xs font-semibold uppercase text-foreground-muted">Holdout (days)</span>
              <input
                type="number"
                min={3}
                max={120}
                value={holdoutDays}
                onChange={(e) => setHoldoutDays(Number(e.target.value))}
                className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2"
              />
            </label>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase text-foreground-muted">Стратегии-кандидаты</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {STRATEGIES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => toggleStrategy(s.key)}
                className={`interactive-focus rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  selectedStrategies.includes(s.key)
                    ? "border-brand-300 bg-brand-50 text-foreground"
                    : "border-border-subtle bg-surface-card text-foreground-secondary"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5">
          <Button
            loading={runBacktest.isPending}
            loadingLabel="Запускаю backtest..."
            onClick={() =>
              runBacktest.mutate({
                workspace_id: workspaceId,
                source_table: sourceTable,
                date_column: dateColumn,
                horizon_days: horizonDays,
                holdout_days: holdoutDays,
                strategies: selectedStrategies
              })
            }
          >
            Запустить AutoML backtest
          </Button>
          {runBacktest.isError ? (
            <p className="mt-2 text-sm text-danger">Не удалось выполнить backtest. Проверьте параметры и доступ к данным.</p>
          ) : null}
          {applyMessage ? <p className="mt-2 text-sm text-foreground-secondary">{applyMessage}</p> : null}
        </div>
      </section>

      {summary.length > 0 ? (
        <section className="surface-section p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Лучшие стратегии по метрикам</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              loading={isBulkApplying}
              loadingLabel="Применяю лучшие модели..."
              disabled={isBulkApplying || runForecast.isPending}
              onClick={() => void applyAllBestModels()}
            >
              Set as default + Run production (all)
            </Button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.map((s) => (
              <article key={s.metric} className="rounded-control border border-border-subtle bg-surface-page px-3 py-3">
                <p className="text-xs text-foreground-muted">{s.metric}</p>
                <p className="mt-1 text-sm font-semibold text-foreground">{s.best}</p>
                <p className="mt-1 text-xs text-foreground-secondary">Score: {s.score ?? "—"}</p>
                {s.preferred ? <p className="mt-1 text-xs text-brand-700">Default: {s.preferred}</p> : null}
              </article>
            ))}
          </div>
          {bulkDetails.length > 0 ? (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {bulkDetails.map((r) => (
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
      ) : null}

      {(runBacktest.data?.leaderboards ?? []).map((lb) => (
        <section key={lb.metric_key} className="surface-section p-5 sm:p-6">
          <h3 className="text-heading-3 text-foreground">Leaderboard: {lb.metric_key}</h3>
          {(() => {
            const transform = (lb.transform ?? {}) as Record<string, unknown>;
            const capHitRatio = asNumber(transform.cap_hit_ratio);
            const configuredCap = asNumber(transform.configured_cap);
            if (capHitRatio === null && configuredCap === null) return null;
            const isHigh = capHitRatio !== null && capHitRatio > 0.05;
            return (
              <div
                className={`mt-2 rounded-control border px-3 py-2 text-xs ${
                  isHigh
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-border-subtle bg-surface-page text-foreground-secondary"
                }`}
              >
                <p>
                  Cap: <span className="font-semibold text-foreground">{configuredCap ?? "auto"}</span>
                  {capHitRatio !== null ? (
                    <>
                      {" "}
                      · cap hit ratio:{" "}
                      <span className="font-semibold text-foreground">{(capHitRatio * 100).toFixed(2)}%</span>
                    </>
                  ) : null}
                </p>
                {isHigh ? (
                  <p className="mt-1">
                    Предупреждение: более 5% точек уперлись в cap, проверьте качество данных или увеличьте DS_METRIC_CAPS.
                  </p>
                ) : null}
              </div>
            );
          })()}
          {(() => {
            const fallbackBest = lb.models.find((m) => m.status === "ok")?.strategy_key ?? null;
            const strategyForDefault = lb.best_strategy ?? fallbackBest;
            const isCurrentDefault = strategyForDefault ? preferredByMetric[lb.metric_key] === strategyForDefault : false;
            return (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!strategyForDefault}
              onClick={() => {
                if (!strategyForDefault) return;
                setPreferredForecastStrategy(workspaceId, lb.metric_key, strategyForDefault);
                setPreferredByMetric((prev) => ({ ...prev, [lb.metric_key]: strategyForDefault }));
                setApplyMessage(`Сохранено: ${lb.metric_key} → ${strategyForDefault}`);
              }}
              className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted disabled:opacity-50"
            >
              {isCurrentDefault ? `Default сохранен (${lb.metric_key})` : `Сделать default для ${lb.metric_key}`}
            </button>
            <button
              type="button"
              disabled={!strategyForDefault || runForecast.isPending}
              onClick={() => {
                if (!strategyForDefault) return;
                runForecast.mutate(
                  {
                    workspace_id: workspaceId,
                    source_table: sourceTable,
                    date_column: dateColumn,
                    horizon_days: horizonDays,
                    preferred_strategy: strategyForDefault
                  },
                  {
                    onSuccess: () => {
                      setApplyMessage(`Production forecast запущен: ${lb.metric_key} с ${strategyForDefault}`);
                    },
                    onError: () => {
                      setApplyMessage(`Не удалось запустить production forecast для ${lb.metric_key}`);
                    }
                  }
                );
              }}
              className="interactive-focus rounded-control bg-brand-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-brand-400 disabled:opacity-50"
            >
              Применить лучшую модель в production
            </button>
          </div>
            );
          })()}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-foreground-muted">
                  <th className="pb-2 pr-3">Strategy</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2 pr-3">MAE</th>
                  <th className="pb-2 pr-3">RMSE</th>
                  <th className="pb-2 pr-3">MAPE</th>
                  <th className="pb-2 pr-3">sMAPE</th>
                  <th className="pb-2">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {lb.models.map((m) => (
                  <tr key={m.strategy_key}>
                    <td className="py-2 pr-3 font-medium text-foreground">{m.strategy_key}</td>
                    <td className="py-2 pr-3 text-foreground-secondary">{m.status}</td>
                    <td className="py-2 pr-3">{m.mae ?? "—"}</td>
                    <td className="py-2 pr-3">{m.rmse ?? "—"}</td>
                    <td className="py-2 pr-3">{m.mape ?? "—"}</td>
                    <td className="py-2 pr-3">{m.smape ?? "—"}</td>
                    <td className="py-2">{m.score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(() => {
            const bestModel = lb.models.find((m) => m.strategy_key === lb.best_strategy);
            if (!bestModel || !bestModel.backtest_preview || bestModel.backtest_preview.length === 0) return null;
            return (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase text-foreground-muted">Actual vs Predicted (backtest)</p>
                <div className="mt-2 h-[220px] rounded-control border border-border-subtle bg-surface-page p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={bestModel.backtest_preview}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#dbe2ea" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="actual" stroke="#111111" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="predicted" stroke="#97db00" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}
          {lb.forecast_preview.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase text-foreground-muted">Forecast preview</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {lb.forecast_preview.slice(0, 8).map((p) => (
                  <div key={`${lb.metric_key}-${p.step}`} className="rounded-control border border-border-subtle bg-surface-page px-3 py-2">
                    <p className="text-xs text-foreground-muted">{p.date}</p>
                    <p className="text-sm font-semibold text-foreground">{p.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}

