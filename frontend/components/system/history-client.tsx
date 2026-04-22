"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { ValidationBadge } from "@/components/notebook/validation-badge";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { useCreateReport } from "@/hooks/api/use-reports";
import { useNotebookRuns, useQueryHistory, useRerunNotebookRun, useSaveRunAsReport } from "@/hooks/api/use-history";
import { runAnalyticsPipeline } from "@/lib/api";
import { upsertReportSnapshot } from "@/lib/reports/local-snapshots";
import type { NotebookRunRow, QueryHistoryRow } from "@/lib/system/mock-data";
import { MOCK_NOTEBOOK_RUNS, MOCK_QUERY_HISTORY } from "@/lib/system/mock-data";
import type { NotebookRunDto, QueryHistoryDto } from "@/types/api/history";

function StatusPill({ status }: { status: NotebookRunRow["status"] }) {
  const map = {
    success: "bg-emerald-50 text-emerald-900 border-emerald-200",
    partial: "bg-amber-50 text-amber-900 border-amber-200",
    failed: "bg-rose-50 text-rose-900 border-rose-200"
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${map[status]}`}>
      {status}
    </span>
  );
}

function mapRunDtoToRow(run: NotebookRunDto): NotebookRunRow {
  return {
    id: run.id,
    ranAt: new Date(run.ran_at).toISOString().slice(0, 16).replace("T", " "),
    notebookTitle: run.notebook_title,
    notebookHref: (`/notebooks/${run.notebook_id}` as Route),
    status: run.status,
    validationOk: run.validation_ok,
    validationHint: run.validation_hint,
    traceSummary: run.trace_summary,
    durationMs: run.duration_ms
  };
}

function mapQueryDtoToRow(query: QueryHistoryDto): QueryHistoryRow {
  const notebookId = query.notebook_id ?? "ops-health";
  return {
    id: query.id,
    ranAt: new Date(query.ran_at).toISOString().slice(0, 16).replace("T", " "),
    label: query.label,
    sqlPreview: query.sql_preview,
    notebookId,
    validationOk: query.validation_ok,
    validationHint: query.validation_hint,
    durationMs: query.duration_ms,
    notebookHref: (`/notebooks/${notebookId}` as Route)
  };
}

export function HistoryClient() {
  const [search, setSearch] = useState("");
  const notebookRunsQuery = useNotebookRuns();
  const queryHistoryQuery = useQueryHistory();
  const [runsState, setRunsState] = useState<NotebookRunRow[]>(MOCK_NOTEBOOK_RUNS);
  const [queriesState, setQueriesState] = useState<QueryHistoryRow[]>(MOCK_QUERY_HISTORY);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyQueryId, setBusyQueryId] = useState<string | null>(null);
  const rerunRun = useRerunNotebookRun();
  const saveRunReport = useSaveRunAsReport();
  const createReport = useCreateReport();

  const busyRunId = rerunRun.isPending
    ? rerunRun.variables
    : saveRunReport.isPending
      ? (saveRunReport.variables?.runId ?? null)
      : null;

  useEffect(() => {
    const incoming = (notebookRunsQuery.data ?? []).map(mapRunDtoToRow);
    if (incoming.length) {
      setRunsState(incoming);
      if (!expanded) setExpanded(incoming[0].id);
    }
  }, [notebookRunsQuery.data, expanded]);

  useEffect(() => {
    const incoming = (queryHistoryQuery.data ?? []).map(mapQueryDtoToRow);
    if (incoming.length) setQueriesState(incoming);
  }, [queryHistoryQuery.data]);

  const onRerunScenario = async (row: NotebookRunRow) => {
    setActionMsg(null);
    try {
      await rerunRun.mutateAsync(row.id);
      setActionMsg(`Сценарий "${row.notebookTitle}" отправлен на перезапуск.`);
    } catch {
      setActionMsg(`Не удалось перезапустить сценарий "${row.notebookTitle}".`);
    }
  };

  const onSaveScenarioAsReport = async (row: NotebookRunRow) => {
    setActionMsg(null);
    try {
      const name = `Отчет: ${row.notebookTitle} · ${row.ranAt}`;
      const saved = await saveRunReport.mutateAsync({ runId: row.id, name });
      const notebookId = row.notebookHref.replace("/notebooks/", "");
      upsertReportSnapshot({
        report_id: saved.report_id,
        report_name: name,
        notebook_id: notebookId,
        prompt: `Rerun from history: ${row.notebookTitle}`,
        insight: row.traceSummary,
        warnings: row.validationOk ? [] : [row.validationHint],
        confidence: row.validationOk ? 0.83 : 0.62,
        created_at: new Date().toISOString()
      });
      setActionMsg(`Отчет для сценария "${row.notebookTitle}" сохранен.`);
    } catch {
      setActionMsg(`Не удалось сохранить отчет для сценария "${row.notebookTitle}".`);
    }
  };

  const onRerunQuery = async (row: QueryHistoryRow) => {
    setActionMsg(null);
    setBusyQueryId(row.id);
    const notebookId = row.notebookId;
    if (!notebookId) {
      setActionMsg("Не удалось определить сценарий для перезапуска запроса.");
      setBusyQueryId(null);
      return;
    }
    try {
      await runAnalyticsPipeline(notebookId, row.label);
      setActionMsg(`Запрос "${row.label}" перезапущен.`);
    } catch {
      setActionMsg(`Не удалось перезапустить запрос "${row.label}".`);
    } finally {
      setBusyQueryId(null);
    }
  };

  const onSaveQueryAsReport = async (row: QueryHistoryRow) => {
    setActionMsg(null);
    setBusyQueryId(row.id);
    const notebookId = row.notebookId;
    try {
      const created = await createReport.mutateAsync({
        name: `Отчет: ${row.label}`,
        format: "pdf",
        ...(notebookId ? { notebook_id: notebookId } : {})
      });
      upsertReportSnapshot({
        report_id: created.id,
        report_name: created.name,
        notebook_id: notebookId,
        prompt: row.label,
        sql: row.sqlPreview,
        insight: `Report created from query history: ${row.label}`,
        warnings: row.validationOk ? [] : [row.validationHint],
        confidence: row.validationOk ? 0.81 : 0.58,
        created_at: new Date().toISOString()
      });
      setActionMsg(`Отчет по запросу "${row.label}" сохранен.`);
    } catch {
      setActionMsg(`Не удалось сохранить отчет по запросу "${row.label}".`);
    } finally {
      setBusyQueryId(null);
    }
  };

  const runs = useMemo(
    () =>
      runsState.filter(
        (r) =>
          r.notebookTitle.toLowerCase().includes(search.toLowerCase()) ||
          r.traceSummary.toLowerCase().includes(search.toLowerCase())
      ),
    [runsState, search]
  );

  const queries = useMemo(
    () =>
      queriesState.filter(
        (q) =>
          q.label.toLowerCase().includes(search.toLowerCase()) ||
          q.sqlPreview.toLowerCase().includes(search.toLowerCase())
      ),
    [queriesState, search]
  );

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title="История запусков"
        subtitle="Запуски сценариев и отдельные запросы — с валидацией, trace summary и последующими действиями."
      />
      <DemoQuickActions
        items={[
          { label: "Открыть сценарии", href: "/notebooks", hint: "Перезапуск из исходного сценария" },
          { label: "Отчеты", href: "/reports", hint: "Поднять запуск до отчета" },
          { label: "Роутер", href: "/demo-router", hint: "Переход к ролевым сценариям" }
        ]}
      />
      {notebookRunsQuery.isLoading || queryHistoryQuery.isLoading ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          Загружаем историю запусков...
        </div>
      ) : null}
      {notebookRunsQuery.isError || queryHistoryQuery.isError ? (
        <div className="rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger-bold">
          История частично недоступна. Показаны fallback-данные.
        </div>
      ) : null}
      {actionMsg ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          {actionMsg}
        </div>
      ) : null}

      <div className="surface-section p-4">
        <label htmlFor="hist-search" className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          Фильтр
        </label>
        <input
          id="hist-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Название сценария, trace, SQL…"
          className="interactive-focus mt-1 w-full max-w-md rounded-control border border-border-subtle bg-surface-page px-3 py-2 text-sm focus:border-brand-400"
        />
      </div>

      <SectionCard title="История запусков сценариев">
        <div className="space-y-3">
          {runs.map((row) => (
            <div
              key={row.id}
              className="surface-content px-3 py-3 sm:px-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={row.notebookHref as Route}
                      className="interactive-focus rounded-control px-0.5 text-sm font-semibold text-foreground hover:text-brand-800 hover:underline"
                    >
                      {row.notebookTitle}
                    </Link>
                    <StatusPill status={row.status} />
                    <ValidationBadge ok={row.validationOk} label={row.validationHint} />
                  </div>
                  <p className="text-xs text-foreground-muted">
                    {row.ranAt} · {(row.durationMs / 1000).toFixed(1)}s
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => onRerunScenario(row)}
                    disabled={busyRunId === row.id}
                    className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted disabled:opacity-60"
                  >
                    {busyRunId === row.id ? "Перезапуск..." : "Перезапустить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveScenarioAsReport(row)}
                    disabled={busyRunId === row.id}
                    className="interactive-focus rounded-control border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-60"
                  >
                    Сохранить как отчет
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExpanded((e) => (e === row.id ? null : row.id))}
                aria-expanded={expanded === row.id}
                aria-controls={`trace-preview-${row.id}`}
                className="interactive-focus mt-2 rounded-control px-0.5 text-xs font-semibold text-brand-700 hover:text-brand-900"
              >
                {expanded === row.id ? "Скрыть trace preview" : "Показать trace preview"}
              </button>
              {expanded === row.id ? (
                <pre
                  id={`trace-preview-${row.id}`}
                  className="surface-console mt-2 max-h-32 overflow-auto p-3 font-mono text-[11px] leading-relaxed"
                >
                  {row.traceSummary}
                </pre>
              ) : null}
            </div>
          ))}
          {runs.length === 0 ? <p className="text-sm text-foreground-muted">Нет запусков по заданному фильтру.</p> : null}
        </div>
      </SectionCard>

      <SectionCard title="История запросов">
        <div className="space-y-3 md:hidden">
          {queries.map((row) => (
            <article key={row.id} className="surface-content space-y-2 px-3 py-3">
              <div className="space-y-1">
                <p className="text-xs tabular-nums text-foreground-muted">{row.ranAt}</p>
                <p className="text-sm font-semibold text-foreground">{row.label}</p>
                <pre className="surface-console max-h-24 overflow-auto p-2 font-mono text-[10px]">{row.sqlPreview}</pre>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ValidationBadge ok={row.validationOk} label={row.validationHint} />
                <span className="text-xs tabular-nums text-foreground-secondary">{row.durationMs} ms</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => onRerunQuery(row)}
                  disabled={busyQueryId === row.id}
                  className="interactive-focus rounded-control border border-border-subtle px-2 py-1.5 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted disabled:opacity-60"
                >
                  {busyQueryId === row.id ? "Выполняется..." : "Перезапустить"}
                </button>
                <button
                  type="button"
                  onClick={() => onSaveQueryAsReport(row)}
                  disabled={busyQueryId === row.id}
                  className="interactive-focus rounded-control border border-brand-200 bg-brand-50 px-2 py-1.5 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-60"
                >
                  {busyQueryId === row.id ? "Сохранение..." : "Сохранить отчет"}
                </button>
                <Link
                  href={row.notebookHref as Route}
                  className="interactive-focus rounded-control border border-border-subtle px-2 py-1.5 text-center text-xs font-semibold text-foreground-secondary hover:bg-surface-muted"
                >
                  Открыть nb
                </Link>
              </div>
            </article>
          ))}
          {queries.length === 0 ? <p className="py-4 text-center text-sm text-foreground-muted">Нет запросов по заданному фильтру.</p> : null}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[560px] border-collapse text-left text-body-sm">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                <th className="pb-2 pr-4">Время</th>
                <th className="pb-2 pr-4">Название</th>
                <th className="pb-2 pr-4">SQL</th>
                <th className="pb-2 pr-4">Валидация</th>
                <th className="pb-2 pr-4">Ms</th>
                <th className="pb-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {queries.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/40">
                  <td className="py-3 pr-4 tabular-nums text-foreground-secondary">{row.ranAt}</td>
                  <td className="py-3 pr-4 font-medium text-foreground">{row.label}</td>
                  <td className="py-3 pr-4 font-mono text-[11px] text-foreground-secondary">{row.sqlPreview}</td>
                  <td className="py-3 pr-4">
                    <ValidationBadge ok={row.validationOk} label={row.validationHint} />
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-foreground-secondary">{row.durationMs}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onRerunQuery(row)}
                        disabled={busyQueryId === row.id}
                        className="interactive-focus rounded-control border border-border-subtle px-2 py-1 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted disabled:opacity-60"
                      >
                        {busyQueryId === row.id ? "Выполняется..." : "Перезапустить"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSaveQueryAsReport(row)}
                        disabled={busyQueryId === row.id}
                        className="interactive-focus rounded-control border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-60"
                      >
                        {busyQueryId === row.id ? "Сохранение..." : "Сохранить отчет"}
                      </button>
                      <Link
                        href={row.notebookHref as Route}
                        className="interactive-focus rounded-control border border-border-subtle px-2 py-1 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted"
                      >
                        Открыть nb
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {queries.length === 0 ? (
            <p className="py-6 text-center text-sm text-foreground-muted">Нет запросов по заданному фильтру.</p>
          ) : null}
        </div>
      </SectionCard>
    </div>
  );
}
