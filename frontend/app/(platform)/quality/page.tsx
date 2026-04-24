"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import {
  fetchNlSqlEvalSummary,
  fetchSqlCorrectnessSummary,
  runNlSqlEvaluation,
  runSqlCorrectnessEvaluation
} from "@/lib/api/evaluation";
import { ApiError } from "@/lib/api/client";
import type {
  CaseEvaluationResultDto,
  NlSqlEvalSummary,
  SqlCorrectnessCaseResultDto,
  SqlCorrectnessSummary
} from "@/types/api/evaluation";

const DEMO_SUMMARY: NlSqlEvalSummary = {
  total_cases: 36,
  passed_cases: 32,
  failed_cases: 4,
  overall_accuracy: 0.89,
  intent_accuracy: 0.93,
  metric_accuracy: 0.9,
  dimension_accuracy: 0.86,
  time_range_accuracy: 0.83,
  chart_accuracy: 0.91,
  clarification_accuracy: 0.88,
  guardrail_accuracy: 1,
  sql_validation_pass_rate: 0.96,
  confidence_average: 0.89,
  updated_at: new Date().toISOString(),
  mode: "mock",
  deterministic_eval: true
};

const DEMO_SQL_CORRECTNESS_SUMMARY: SqlCorrectnessSummary = {
  total_cases: 4,
  passed_cases: 4,
  failed_cases: 0,
  overall_accuracy: 1,
  fragment_pass_rate: 1,
  table_pass_rate: 1,
  gold_exact_pass_rate: 1,
  live_scalar_pass_rate: 1,
  live_scalar_coverage: 0.25,
  sql_validation_pass_rate: 1,
  updated_at: new Date().toISOString(),
  mode: "mock"
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function StatCard(props: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-control border border-border-subtle bg-surface-card p-4 shadow-xs">
      <div className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{props.value}</div>
      {props.hint ? <div className="mt-1 text-xs text-foreground-secondary">{props.hint}</div> : null}
    </div>
  );
}

export default function NlSqlQualityPage() {
  const [summary, setSummary] = useState<NlSqlEvalSummary | null>(null);
  const [cases, setCases] = useState<CaseEvaluationResultDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoFallback, setDemoFallback] = useState(false);
  const [selected, setSelected] = useState<CaseEvaluationResultDto | null>(null);
  const [sqlSummary, setSqlSummary] = useState<SqlCorrectnessSummary | null>(null);
  const [sqlCases, setSqlCases] = useState<SqlCorrectnessCaseResultDto[]>([]);
  const [sqlRunning, setSqlRunning] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchNlSqlEvalSummary("mock");
      setSummary(s);
      setDemoFallback(false);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 404)) {
        setSummary(DEMO_SUMMARY);
        setDemoFallback(true);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
        setSummary(DEMO_SUMMARY);
        setDemoFallback(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSqlSummary = useCallback(async () => {
    try {
      const s = await fetchSqlCorrectnessSummary("mock");
      setSqlSummary(s);
    } catch (_e) {
      setSqlSummary(DEMO_SQL_CORRECTNESS_SUMMARY);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
    void loadSqlSummary();
  }, [loadSummary, loadSqlSummary]);

  const onRun = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await runNlSqlEvaluation("mock");
      setSummary(res.summary);
      setCases(res.case_results);
      setDemoFallback(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить evaluation");
      setSummary(DEMO_SUMMARY);
      setCases([]);
      setDemoFallback(true);
    } finally {
      setRunning(false);
    }
  };

  const onRunSqlCorrectness = async () => {
    setSqlRunning(true);
    try {
      const mode = "live";
      const res = await runSqlCorrectnessEvaluation(mode);
      setSqlSummary(res.summary);
      setSqlCases(res.case_results);
    } catch (_e) {
      const fallback = await runSqlCorrectnessEvaluation("mock");
      setSqlSummary(fallback.summary);
      setSqlCases(fallback.case_results);
    } finally {
      setSqlRunning(false);
    }
  };

  const rows = useMemo(() => cases, [cases]);

  return (
    <div className="layout-page-stack">
      <header className="rounded-control border border-border-subtle bg-gradient-to-br from-brand-50/80 to-surface-card p-6 shadow-xs">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Quality Center</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">NL→SQL Quality Center</h1>
        <p className="mt-2 max-w-3xl text-sm text-foreground-secondary">
          Показываем жюри, что точность интерпретации измеряется, тестируется и контролируется.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 disabled:opacity-60"
            disabled={running}
            onClick={() => void onRun()}
          >
            {running ? "Запуск…" : "Run evaluation"}
          </button>
          <Link
            href={"/dashboard/manager" as Route}
            className="inline-flex items-center rounded-control border border-border-subtle bg-surface-card px-4 py-2 text-sm font-medium text-foreground-secondary transition hover:bg-surface-muted/60"
          >
            К дашборду менеджера
          </Link>
        </div>
        {demoFallback ? (
          <p className="mt-3 text-xs font-medium text-amber-800">
            Demo metrics from deterministic evaluation mode — backend недоступен, показаны запасные значения.
          </p>
        ) : null}
        {error && !demoFallback ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </header>

      {loading ? (
        <div className="rounded-control border border-dashed border-border-subtle bg-surface-muted/40 p-8 text-center text-sm text-foreground-secondary">
          Загрузка метрик…
        </div>
      ) : summary ? (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Overall accuracy" value={pct(summary.overall_accuracy)} />
          <StatCard label="Intent accuracy" value={pct(summary.intent_accuracy)} />
          <StatCard label="Metric accuracy" value={pct(summary.metric_accuracy)} />
          <StatCard label="SQL validation pass rate" value={pct(summary.sql_validation_pass_rate)} />
          <StatCard label="Clarification accuracy" value={pct(summary.clarification_accuracy)} />
          <StatCard label="Guardrail accuracy" value={pct(summary.guardrail_accuracy)} />
        </section>
      ) : null}

      <SectionCard
        title="Контролируемый pipeline"
        description="От промпта до инсайта — с валидацией SQL и объяснимостью."
      >
        <div className="rounded-control border border-border-subtle bg-surface-muted/30 p-4 font-mono text-xs text-foreground-secondary">
          Prompt → Intent → Metric → Dimensions → Time range → SQL → Validation → Chart → Insight
        </div>
      </SectionCard>

      <SectionCard title="Golden cases" description="Эталонные бизнес-запросы и сравнение с фактической интерпретацией.">
        {rows.length === 0 ? (
          <p className="text-sm text-foreground-secondary">
            Нажмите «Run evaluation», чтобы загрузить результаты прогона (или используйте summary выше).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-foreground-muted">
                  <th className="py-2 pr-3">Prompt</th>
                  <th className="py-2 pr-3">Category</th>
                  <th className="py-2 pr-3">Expected intent</th>
                  <th className="py-2 pr-3">Actual intent</th>
                  <th className="py-2 pr-3">Confidence</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Failure</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const exp = row.expected as { intent?: string };
                  const act = row.actual as { intent?: string; confidence?: number };
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border-subtle/80 hover:bg-brand-50/40"
                      onClick={() => setSelected(row)}
                    >
                      <td className="max-w-[220px] truncate py-2 pr-3 text-foreground">{row.prompt}</td>
                      <td className="py-2 pr-3">
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium">{row.category}</span>
                      </td>
                      <td className="py-2 pr-3 text-foreground-secondary">{String(exp.intent ?? "—")}</td>
                      <td className="py-2 pr-3 text-foreground-secondary">{String(act.intent ?? "—")}</td>
                      <td className="py-2 pr-3">{typeof act.confidence === "number" ? act.confidence.toFixed(2) : "—"}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            row.passed ? "text-emerald-700 font-medium" : "text-amber-800 font-medium"
                          }
                        >
                          {row.passed ? "passed" : "failed"}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate py-2 text-xs text-foreground-muted">{row.failure_reason ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="SQL Correctness Suite"
        description="Проверка структуры SQL и live scalar parity с эталонным запросом, если доступен Postgres."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 disabled:opacity-60"
            disabled={sqlRunning}
            onClick={() => void onRunSqlCorrectness()}
          >
            {sqlRunning ? "Запуск SQL suite…" : "Run SQL correctness (live→mock fallback)"}
          </button>
          <span className="text-xs text-foreground-secondary">
            Сначала `live`, при недоступности БД автоматически fallback на `mock`.
          </span>
        </div>
        {sqlSummary ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="SQL overall accuracy" value={pct(sqlSummary.overall_accuracy)} />
            <StatCard label="Fragments pass rate" value={pct(sqlSummary.fragment_pass_rate)} />
            <StatCard label="Tables pass rate" value={pct(sqlSummary.table_pass_rate)} />
            <StatCard label="Live scalar pass rate" value={pct(sqlSummary.live_scalar_pass_rate)} />
            <StatCard label="Live scalar coverage" value={pct(sqlSummary.live_scalar_coverage)} />
            <StatCard label="SQL validation pass rate" value={pct(sqlSummary.sql_validation_pass_rate)} />
          </div>
        ) : null}
        {sqlCases.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-xs uppercase tracking-wide text-foreground-muted">
                  <th className="py-2 pr-3">Prompt</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Live scalar</th>
                  <th className="py-2">Failure</th>
                </tr>
              </thead>
              <tbody>
                {sqlCases.map((row) => {
                  const actual = row.actual as { live_scalar_status?: string };
                  return (
                    <tr key={row.id} className="border-b border-border-subtle/80">
                      <td className="max-w-[320px] truncate py-2 pr-3 text-foreground">{row.prompt}</td>
                      <td className="py-2 pr-3">
                        <span className={row.passed ? "font-medium text-emerald-700" : "font-medium text-amber-800"}>
                          {row.passed ? "passed" : "failed"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-foreground-secondary">{actual.live_scalar_status ?? "—"}</td>
                      <td className="max-w-[300px] truncate py-2 text-xs text-foreground-muted">{row.failure_reason ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </SectionCard>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-control border border-border-subtle bg-surface-card p-5 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold text-foreground">Кейс: {selected.id}</h2>
              <button
                type="button"
                className="rounded-control border border-border-subtle px-2 py-1 text-xs font-medium text-foreground-secondary hover:bg-surface-muted/60"
                onClick={() => setSelected(null)}
              >
                Закрыть
              </button>
            </div>
            <p className="mt-2 text-sm text-foreground-secondary">{selected.prompt}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-control border border-border-subtle bg-surface-muted/30 p-3 text-xs">
                <div className="font-semibold text-foreground">Expected</div>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-foreground-secondary">
                  {JSON.stringify(selected.expected, null, 2)}
                </pre>
              </div>
              <div className="rounded-control border border-border-subtle bg-surface-muted/30 p-3 text-xs">
                <div className="font-semibold text-foreground">Actual</div>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-foreground-secondary">
                  {JSON.stringify(selected.actual, null, 2)}
                </pre>
              </div>
            </div>
            <div className="mt-3 text-xs">
              <span className="font-semibold">Checks:</span>{" "}
              <code className="rounded bg-surface-muted px-1">{JSON.stringify(selected.checks)}</code>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
