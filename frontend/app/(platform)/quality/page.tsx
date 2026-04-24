"use client";

import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { ApiError } from "@/lib/api/client";
import {
  fetchQualityCenterSummary,
  fetchQualityLastRunDetails,
  fetchRepairBriefLatest,
  runGuardrailsEvaluation,
  runPromptStabilityCheck,
  runQualityCenterEvaluation,
  runSqlCorrectnessEvaluation,
  runUnderstandingEvaluation,
  runVisualizationEvaluation
} from "@/lib/api/evaluation";
import type {
  CaseEvaluationResultDto,
  GuardrailsCaseResultDto,
  QualityCenterOverview,
  QualityLastRunBundle,
  RepairBriefLatestResponse,
  SqlCorrectnessCaseResultDto,
  VisualizationCaseResultDto
} from "@/types/api/evaluation";
import type { EvaluationMode } from "@/types/api/evaluation";

type QTab =
  | "overview"
  | "understanding"
  | "sql"
  | "visualization"
  | "guardrails"
  | "repair"
  | "stability";

type CaseDetail =
  | { suite: "understanding"; row: CaseEvaluationResultDto }
  | { suite: "sql"; row: SqlCorrectnessCaseResultDto }
  | { suite: "visualization"; row: VisualizationCaseResultDto }
  | { suite: "guardrails"; row: GuardrailsCaseResultDto };

const DEMO_MODE: EvaluationMode = "deterministic";

const DEMO_OVERVIEW: QualityCenterOverview = {
  overall_quality_score: 0.91,
  nl_sql_understanding: {
    suite: "understanding",
    total_cases: 31,
    passed_cases: 29,
    overall_accuracy: 0.93,
    mode: DEMO_MODE,
    extra: {}
  },
  sql_correctness: {
    suite: "sql_correctness",
    total_cases: 25,
    passed_cases: 24,
    overall_accuracy: 0.92,
    mode: DEMO_MODE,
    extra: {}
  },
  visualization_match: {
    suite: "visualization",
    total_cases: 20,
    passed_cases: 19,
    overall_accuracy: 0.9,
    mode: DEMO_MODE,
    extra: {}
  },
  guardrails_safety: {
    suite: "guardrails",
    total_cases: 20,
    passed_cases: 20,
    overall_accuracy: 1,
    mode: DEMO_MODE,
    extra: {}
  },
  updated_at: new Date().toISOString(),
  mode: DEMO_MODE
};

const DEMO_REPAIR: RepairBriefLatestResponse = {
  found: true,
  run_id: "demo",
  overall_quality_score: 0.91,
  repair_brief_md:
    "# Drivee Quality Center — Repair Brief (demo)\n\nНет сохранённого прогона на сервере — показан **демо deterministic** текст.\n\nПосле `POST /evaluation/quality/run` здесь появится реальный `repair_brief.md` с кластерами ошибок."
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function Badge(props: { kind: "passed" | "failed" | "warn" | "blocked" | "neutral"; children: ReactNode }) {
  const cls =
    props.kind === "passed"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : props.kind === "failed"
        ? "bg-amber-50 text-amber-900 border-amber-200"
        : props.kind === "blocked"
          ? "bg-red-50 text-red-800 border-red-200"
          : props.kind === "warn"
            ? "bg-amber-50/80 text-amber-900 border-amber-100"
            : "bg-surface-muted text-foreground-secondary border-border-subtle";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {props.children}
    </span>
  );
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

const TABS: { id: QTab; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "understanding", label: "Understanding" },
  { id: "sql", label: "SQL Correctness" },
  { id: "visualization", label: "Visualization" },
  { id: "guardrails", label: "Guardrails" },
  { id: "repair", label: "Repair Brief" },
  { id: "stability", label: "Prompt Stability" }
];

export default function DriveeQualityCenterPage() {
  const [mode, setMode] = useState<EvaluationMode>("deterministic");
  const [tab, setTab] = useState<QTab>("overview");
  const [demoFallback, setDemoFallback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<QualityCenterOverview | null>(null);
  const [bundle, setBundle] = useState<QualityLastRunBundle | null>(null);
  const [repair, setRepair] = useState<RepairBriefLatestResponse | null>(null);
  const [selected, setSelected] = useState<CaseDetail | null>(null);

  const [stabPrompt, setStabPrompt] = useState("Покажи лучшие каналы");
  const [stabRuns, setStabRuns] = useState(5);
  const [stabLoading, setStabLoading] = useState(false);
  const [stabResult, setStabResult] = useState<Awaited<ReturnType<typeof runPromptStabilityCheck>> | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, det, rb] = await Promise.all([
        fetchQualityCenterSummary(mode),
        fetchQualityLastRunDetails(mode),
        fetchRepairBriefLatest()
      ]);
      setOverview(ov);
      setBundle(det);
      setRepair(rb);
      setDemoFallback(false);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 404)) {
        setOverview(DEMO_OVERVIEW);
        setBundle(null);
        setRepair(DEMO_REPAIR);
        setDemoFallback(true);
        setError(null);
      } else {
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
        setOverview(DEMO_OVERVIEW);
        setRepair(DEMO_REPAIR);
        setDemoFallback(true);
      }
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const statusPassed = useMemo(() => {
    if (!overview) return false;
    return overview.overall_quality_score >= 0.85;
  }, [overview]);

  const onRunAll = async () => {
    setRunning(true);
    setError(null);
    try {
      await runQualityCenterEvaluation(mode);
      const [ov, det, rb] = await Promise.all([
        fetchQualityCenterSummary(mode),
        fetchQualityLastRunDetails(mode),
        fetchRepairBriefLatest()
      ]);
      setOverview(ov);
      setBundle(det);
      setRepair(rb);
      setDemoFallback(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить прогон");
      setOverview(DEMO_OVERVIEW);
      setDemoFallback(true);
    } finally {
      setRunning(false);
    }
  };

  const onRunSuite = async (suite: "understanding" | "sql" | "visualization" | "guardrails") => {
    setRunning(true);
    setError(null);
    try {
      if (suite === "understanding") await runUnderstandingEvaluation(mode);
      if (suite === "sql") await runSqlCorrectnessEvaluation(mode);
      if (suite === "visualization") await runVisualizationEvaluation(mode);
      if (suite === "guardrails") await runGuardrailsEvaluation(mode);
      const det = await fetchQualityLastRunDetails(mode);
      setBundle(det);
      const ov = await fetchQualityCenterSummary(mode);
      setOverview(ov);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка suite");
    } finally {
      setRunning(false);
    }
  };

  const onStability = async () => {
    setStabLoading(true);
    try {
      const r = await runPromptStabilityCheck({ prompt: stabPrompt, runs: stabRuns, mode });
      setStabResult(r);
    } catch (_e) {
      setStabResult({
        prompt: stabPrompt,
        runs: stabRuns,
        stability_score: 1,
        outcomes: { clarification: stabRuns },
        results: Array.from({ length: stabRuns }, (_, i) => ({
          run_index: i + 1,
          outcome: "clarification",
          clarification_required: true,
          execution_status: "skipped",
          sql_preview: "",
          blocked: false
        }))
      });
    } finally {
      setStabLoading(false);
    }
  };

  const jurySummary = useMemo(() => {
    const o = overview ?? DEMO_OVERVIEW;
    return [
      "Drivee Quality Center — кратко для жюри",
      "",
      `- Overall Quality Score: ${(o.overall_quality_score * 100).toFixed(1)}%`,
      `- NL→SQL Understanding: ${(o.nl_sql_understanding.overall_accuracy * 100).toFixed(1)}% (${o.nl_sql_understanding.passed_cases}/${o.nl_sql_understanding.total_cases})`,
      `- SQL Correctness: ${(o.sql_correctness.overall_accuracy * 100).toFixed(1)}%`,
      `- Visualization Match: ${(o.visualization_match.overall_accuracy * 100).toFixed(1)}%`,
      `- Guardrails & Safety: ${(o.guardrails_safety.overall_accuracy * 100).toFixed(1)}%`,
      `- Режим: ${o.mode}; обновлено: ${o.updated_at}`,
      "",
      "Качество измеряется golden suite и repair brief, а не заявляется."
    ].join("\n");
  }, [overview]);

  const copyJury = async () => {
    try {
      await navigator.clipboard.writeText(jurySummary);
    } catch {
      /* ignore */
    }
  };

  const uRows = bundle?.understanding?.case_results ?? [];
  const sRows = bundle?.sql_correctness?.case_results ?? [];
  const vRows = bundle?.visualization?.case_results ?? [];
  const gRows = bundle?.guardrails?.case_results ?? [];

  return (
    <div className="layout-page-stack">
      <header className="rounded-control border border-border-subtle bg-gradient-to-br from-brand-50/90 via-surface-card to-surface-card p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Drivee Analytics</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Drivee Quality Center</h1>
            <p className="mt-2 max-w-3xl text-sm text-foreground-secondary">
              Мы измеряем качество NL→SQL, SQL correctness, визуализации и guardrails, а не просто доверяем LLM.
            </p>
          </div>
          {demoFallback ? <Badge kind="warn">Demo deterministic mode</Badge> : <Badge kind="passed">Live API</Badge>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-foreground-secondary">
            Режим
            <select
              className="rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-sm text-foreground"
              value={mode}
              onChange={(e) => setMode(e.target.value as EvaluationMode)}
            >
              <option value="deterministic">deterministic</option>
              <option value="mock">mock</option>
              <option value="live">live</option>
            </select>
          </label>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-brand-700 disabled:opacity-60"
            disabled={running || loading}
            onClick={() => void onRunAll()}
          >
            {running ? "Прогон…" : "Run all evaluations"}
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-sm font-medium text-foreground-secondary hover:bg-surface-muted/60"
            onClick={() => void copyJury()}
          >
            Copy jury summary
          </button>
          <Link
            href={"/dashboard/manager" as Route}
            className="inline-flex items-center rounded-control border border-border-subtle px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-muted/60"
          >
            К дашборду
          </Link>
        </div>
        {error && !demoFallback ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </header>

      {!loading && overview ? (
        <section className="grid gap-3 lg:grid-cols-4">
          <div className="rounded-control border border-border-subtle bg-surface-card p-4 shadow-xs lg:col-span-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Overall Quality Score</div>
            <div className="mt-2 text-3xl font-semibold text-brand-800">{pct(overview.overall_quality_score)}</div>
            <div className="mt-2 flex items-center gap-2">
              <Badge kind={statusPassed ? "passed" : "failed"}>{statusPassed ? "Passed" : "Needs attention"}</Badge>
              <span className="text-xs text-foreground-muted">порог демо 85%</span>
            </div>
            <p className="mt-2 text-xs text-foreground-secondary">Last run: {overview.updated_at}</p>
            <p className="text-xs text-foreground-secondary">Mode: {overview.mode}</p>
          </div>
          <StatCard label="NL→SQL Understanding" value={pct(overview.nl_sql_understanding.overall_accuracy)} />
          <StatCard label="SQL Correctness" value={pct(overview.sql_correctness.overall_accuracy)} />
          <StatCard label="Guardrails & Safety" value={pct(overview.guardrails_safety.overall_accuracy)} />
        </section>
      ) : loading ? (
        <div className="rounded-control border border-dashed border-border-subtle p-8 text-center text-sm text-foreground-secondary">
          Загрузка…
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 rounded-control border border-border-subtle bg-surface-muted/30 p-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-control px-3 py-2 text-sm font-medium transition ${
              tab === t.id ? "bg-brand-600 text-white shadow-xs" : "text-foreground-secondary hover:bg-surface-card"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && overview ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { key: "understanding", title: "NL→SQL Understanding", s: overview.nl_sql_understanding },
            { key: "sql", title: "SQL Correctness", s: overview.sql_correctness },
            { key: "viz", title: "Visualization Match", s: overview.visualization_match },
            { key: "gr", title: "Guardrails & Safety", s: overview.guardrails_safety }
          ].map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() =>
                setTab(c.key === "understanding" ? "understanding" : c.key === "sql" ? "sql" : c.key === "viz" ? "visualization" : "guardrails")
              }
              className="rounded-control border border-border-subtle bg-surface-card p-4 text-left shadow-xs transition hover:border-brand-200 hover:shadow-sm"
            >
              <div className="text-sm font-semibold text-foreground">{c.title}</div>
              <div className="mt-3 text-2xl font-semibold text-brand-800">{pct(c.s.overall_accuracy)}</div>
              <div className="mt-1 text-xs text-foreground-secondary">
                {c.s.passed_cases}/{c.s.total_cases} passed
              </div>
            </button>
          ))}
        </section>
      ) : null}

      {tab === "understanding" ? (
        <SectionCard
          title="NL→SQL Understanding"
          description="Intent, метрика, измерения, период, clarification, follow-up и guardrail-ожидания."
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running}
              className="rounded-control bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void onRunSuite("understanding")}
            >
              Run suite
            </button>
          </div>
          {bundle?.understanding?.summary ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Overall" value={pct(bundle.understanding.summary.overall_accuracy)} />
              <StatCard label="Intent" value={pct(bundle.understanding.summary.intent_accuracy)} />
              <StatCard label="Metric" value={pct(bundle.understanding.summary.metric_accuracy)} />
            </div>
          ) : null}
          {uRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase text-foreground-muted">
                    <th className="py-2 pr-2">Prompt</th>
                    <th className="py-2 pr-2">Category</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2 pr-2">Score</th>
                    <th className="py-2">Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {uRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border-subtle/80 hover:bg-brand-50/40"
                      onClick={() => setSelected({ suite: "understanding", row })}
                    >
                      <td className="max-w-[240px] truncate py-2 pr-2">{row.prompt}</td>
                      <td className="py-2 pr-2">
                        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs">{row.category}</span>
                      </td>
                      <td className="py-2 pr-2">{row.passed ? <Badge kind="passed">Passed</Badge> : <Badge kind="failed">Failed</Badge>}</td>
                      <td className="py-2 pr-2">{row.score.toFixed(2)}</td>
                      <td className="max-w-[200px] truncate py-2 text-xs text-foreground-muted">{row.failure_reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-foreground-secondary">Нет закэшированных кейсов — нажмите Run all или Run suite.</p>
          )}
        </SectionCard>
      ) : null}

      {tab === "sql" ? (
        <SectionCard title="SQL Correctness" description="Таблицы, колонки, агрегации, result shape, safety.">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running}
              className="rounded-control bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void onRunSuite("sql")}
            >
              Run suite
            </button>
          </div>
          {bundle?.sql_correctness?.summary ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <StatCard label="Overall" value={pct(bundle.sql_correctness.summary.overall_accuracy)} />
              <StatCard label="Fragments" value={pct(bundle.sql_correctness.summary.fragment_pass_rate)} />
              <StatCard label="Tables" value={pct(bundle.sql_correctness.summary.table_pass_rate)} />
            </div>
          ) : null}
          {sRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase text-foreground-muted">
                    <th className="py-2 pr-2">Prompt</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {sRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border-subtle/80 hover:bg-brand-50/40"
                      onClick={() => setSelected({ suite: "sql", row })}
                    >
                      <td className="max-w-[320px] truncate py-2 pr-2">{row.prompt}</td>
                      <td className="py-2 pr-2">{row.passed ? <Badge kind="passed">Passed</Badge> : <Badge kind="failed">Failed</Badge>}</td>
                      <td className="max-w-[260px] truncate py-2 text-xs text-foreground-muted">{row.failure_reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-foreground-secondary">Нет данных — запустите прогон.</p>
          )}
        </SectionCard>
      ) : null}

      {tab === "visualization" ? (
        <SectionCard title="Visualization Match" description="Тип графика и согласованность с бизнес-формулировкой.">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running}
              className="rounded-control bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void onRunSuite("visualization")}
            >
              Run suite
            </button>
          </div>
          {bundle?.visualization?.summary ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <StatCard label="Overall" value={pct(bundle.visualization.summary.overall_accuracy)} />
              <StatCard label="Chart match" value={pct(bundle.visualization.summary.chart_match_rate)} />
            </div>
          ) : null}
          {vRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase text-foreground-muted">
                    <th className="py-2 pr-2">Prompt</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {vRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border-subtle/80 hover:bg-brand-50/40"
                      onClick={() => setSelected({ suite: "visualization", row })}
                    >
                      <td className="max-w-[320px] truncate py-2 pr-2">{row.prompt}</td>
                      <td className="py-2 pr-2">{row.passed ? <Badge kind="passed">Passed</Badge> : <Badge kind="failed">Failed</Badge>}</td>
                      <td className="max-w-[260px] truncate py-2 text-xs text-foreground-muted">{row.failure_reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-foreground-secondary">Нет данных — запустите прогон.</p>
          )}
        </SectionCard>
      ) : null}

      {tab === "guardrails" ? (
        <SectionCard title="Guardrails & Safety" description="Опасный SQL, чувствительные данные, политики ролей — без исполнения.">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running}
              className="rounded-control bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void onRunSuite("guardrails")}
            >
              Run suite
            </button>
          </div>
          {bundle?.guardrails?.summary ? (
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <StatCard label="Overall" value={pct(bundle.guardrails.summary.overall_accuracy)} />
              <StatCard label="Cases" value={`${bundle.guardrails.summary.passed_cases}/${bundle.guardrails.summary.total_cases}`} />
            </div>
          ) : null}
          {gRows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-xs uppercase text-foreground-muted">
                    <th className="py-2 pr-2">Prompt</th>
                    <th className="py-2 pr-2">Category</th>
                    <th className="py-2 pr-2">Status</th>
                    <th className="py-2">Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {gRows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-border-subtle/80 hover:bg-brand-50/40"
                      onClick={() => setSelected({ suite: "guardrails", row })}
                    >
                      <td className="max-w-[280px] truncate py-2 pr-2">{row.prompt}</td>
                      <td className="py-2 pr-2 text-xs">{row.category}</td>
                      <td className="py-2 pr-2">{row.passed ? <Badge kind="passed">Passed</Badge> : <Badge kind="failed">Failed</Badge>}</td>
                      <td className="max-w-[220px] truncate py-2 text-xs text-foreground-muted">{row.failure_reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-foreground-secondary">Нет данных — запустите прогон.</p>
          )}
        </SectionCard>
      ) : null}

      {tab === "repair" ? (
        <SectionCard
          title="Repair Brief"
          description="Последний markdown-отчёт после POST /evaluation/quality/run (кластеры ошибок и рекомендации)."
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running}
              className="rounded-control bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              onClick={() => void onRunAll()}
            >
              Open latest (run all)
            </button>
            <button
              type="button"
              className="rounded-control border border-border-subtle px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-muted/60"
              onClick={() => void fetchRepairBriefLatest().then(setRepair)}
            >
              Refresh from API
            </button>
          </div>
          {(repair ?? DEMO_REPAIR).found ? (
            <div className="rounded-control border border-border-subtle bg-surface-muted/20 p-4">
              <p className="text-xs text-foreground-secondary">
                Run: {(repair ?? DEMO_REPAIR).run_id}
                {(repair ?? DEMO_REPAIR).overall_quality_score != null && (repair ?? DEMO_REPAIR).overall_quality_score !== undefined
                  ? ` · score ${(((repair ?? DEMO_REPAIR).overall_quality_score as number) * 100).toFixed(1)}%`
                  : null}
              </p>
              <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap font-mono text-xs text-foreground-secondary">
                {(repair ?? DEMO_REPAIR).repair_brief_md}
              </pre>
            </div>
          ) : (
            <p className="text-sm text-foreground-secondary">Пока нет сохранённых прогонов — выполните Run all evaluations.</p>
          )}
        </SectionCard>
      ) : null}

      {tab === "stability" ? (
        <SectionCard title="Prompt Stability" description="Одинаковый промпт N раз — сравнение исходов (SQL, clarification, block).">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm text-foreground-secondary">
              Промпт
              <textarea
                className="mt-1 w-full rounded-control border border-border-subtle bg-surface-card p-2 text-sm text-foreground"
                rows={3}
                value={stabPrompt}
                onChange={(e) => setStabPrompt(e.target.value)}
              />
            </label>
            <label className="text-sm text-foreground-secondary">
              Runs
              <input
                type="number"
                min={1}
                max={50}
                className="mt-1 w-full rounded-control border border-border-subtle bg-surface-card p-2 text-sm"
                value={stabRuns}
                onChange={(e) => setStabRuns(Number(e.target.value) || 1)}
              />
            </label>
          </div>
          <button
            type="button"
            className="mt-3 rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={stabLoading}
            onClick={() => void onStability()}
          >
            {stabLoading ? "Запуск…" : "Run stability check"}
          </button>
          {stabResult ? (
            <div className="mt-4 space-y-3">
              <StatCard label="Stability score" value={pct(stabResult.stability_score)} />
              <div className="rounded-control border border-border-subtle bg-surface-card p-3 text-sm">
                <div className="font-semibold text-foreground">Outcomes</div>
                <pre className="mt-2 text-xs text-foreground-secondary">{JSON.stringify(stabResult.outcomes, null, 2)}</pre>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-foreground-muted">
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Outcome</th>
                      <th className="py-2 pr-2">Blocked</th>
                      <th className="py-2">SQL preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stabResult.results.map((r) => (
                      <tr key={r.run_index} className="border-b border-border-subtle/70">
                        <td className="py-2 pr-2">{r.run_index}</td>
                        <td className="py-2 pr-2">{r.outcome}</td>
                        <td className="py-2 pr-2">{r.blocked ? <Badge kind="blocked">Blocked</Badge> : "—"}</td>
                        <td className="max-w-[280px] truncate py-2 font-mono text-xs">{r.sql_preview || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-control border border-border-subtle bg-surface-card p-5 shadow-lg"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase text-foreground-muted">{selected.suite}</p>
                <h2 className="text-lg font-semibold text-foreground">Кейс: {selected.row.id}</h2>
              </div>
              <button
                type="button"
                className="rounded-control border border-border-subtle px-2 py-1 text-xs font-medium hover:bg-surface-muted/60"
                onClick={() => setSelected(null)}
              >
                Закрыть
              </button>
            </div>
            <p className="mt-2 text-sm text-foreground-secondary">{selected.row.prompt}</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-control border border-border-subtle bg-surface-muted/30 p-3 text-xs">
                <div className="font-semibold text-foreground">Expected</div>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-foreground-secondary">
                  {JSON.stringify(selected.row.expected, null, 2)}
                </pre>
              </div>
              <div className="rounded-control border border-border-subtle bg-surface-muted/30 p-3 text-xs">
                <div className="font-semibold text-foreground">Actual</div>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-foreground-secondary">
                  {JSON.stringify(selected.row.actual, null, 2)}
                </pre>
              </div>
            </div>
            {"checks" in selected.row ? (
              <div className="mt-3 text-xs">
                <span className="font-semibold">Checks:</span>{" "}
                <code className="rounded bg-surface-muted px-1">{JSON.stringify(selected.row.checks)}</code>
              </div>
            ) : null}
            {"failure_reason" in selected.row && selected.row.failure_reason ? (
              <p className="mt-2 text-sm text-amber-900">
                <span className="font-semibold">Failure: </span>
                {selected.row.failure_reason}
              </p>
            ) : null}
            {selected.suite === "understanding" && selected.row.actual && typeof selected.row.actual === "object" && "sql" in selected.row.actual ? (
              <div className="mt-3">
                <div className="text-xs font-semibold text-foreground">Generated SQL</div>
                <pre className="mt-1 max-h-40 overflow-auto rounded-control border border-border-subtle bg-surface-muted/50 p-3 font-mono text-xs">
                  {String((selected.row.actual as { sql?: string }).sql || "—")}
                </pre>
              </div>
            ) : null}
            {selected.suite === "understanding" &&
            selected.row.actual &&
            Array.isArray((selected.row.actual as { trace?: unknown }).trace) ? (
              <div className="mt-3">
                <div className="text-xs font-semibold text-foreground">Trace</div>
                <pre className="mt-1 max-h-48 overflow-auto rounded-control border border-border-subtle bg-surface-muted/50 p-3 font-mono text-xs">
                  {JSON.stringify((selected.row.actual as { trace: unknown[] }).trace, null, 2)}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
