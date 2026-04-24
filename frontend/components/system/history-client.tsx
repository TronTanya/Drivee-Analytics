"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { ValidationBadge } from "@/components/notebook/validation-badge";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { useCreateReport } from "@/hooks/api/use-reports";
import { useNotebookRuns, useQueryHistory } from "@/hooks/api/use-history";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { runAnalyticsPipeline } from "@/lib/api";
import { upsertReportSnapshot } from "@/lib/reports/local-snapshots";
import type { NotebookRunRow, QueryHistoryRow } from "@/lib/system/mock-data";
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
    notebookId: run.notebook_id,
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
    executionStatus: query.execution_status,
    durationMs: query.duration_ms,
    notebookHref: (`/notebooks/${notebookId}` as Route),
    interpretedSummary: query.interpreted_summary,
    chartType: query.chart_type,
    parsedIntent: query.parsed_intent_json,
    confidence: query.confidence ?? undefined,
    resultSummary: query.result_summary ?? undefined,
    authorRoleKey: query.author_role_key ?? undefined,
    ownerUserId: query.owner_user_id,
    saveAsReportBodyHint: query.save_as_report_body_hint
  };
}

export function HistoryClient() {
  const [search, setSearch] = useState("");
  const workspaceQuery = useWorkspaceId();
  const [histQ, setHistQ] = useState("");
  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");
  const [histType, setHistType] = useState("all");
  const [histScope, setHistScope] = useState<"mine" | "workspace">("workspace");
  const notebookRunsQuery = useNotebookRuns(workspaceQuery.data, { scope: histScope });
  const queryHistoryQuery = useQueryHistory(workspaceQuery.data, {
    q: histQ.trim() || undefined,
    date_from: histFrom ? `${histFrom}T00:00:00Z` : undefined,
    date_to: histTo ? `${histTo}T23:59:59Z` : undefined,
    query_type: histType === "all" ? undefined : histType,
    scope: histScope
  });
  const [runsState, setRunsState] = useState<NotebookRunRow[]>([]);
  const [queriesState, setQueriesState] = useState<QueryHistoryRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [busyQuery, setBusyQuery] = useState<null | { type: "rerun" | "report"; id: string }>(null);
  const [busyRun, setBusyRun] = useState<null | { type: "rerun" | "report"; id: string }>(null);
  const createReport = useCreateReport();

  useEffect(() => {
    if (notebookRunsQuery.data === undefined) return;
    const incoming = (notebookRunsQuery.data ?? []).map(mapRunDtoToRow);
    setRunsState(incoming);
    if (!expanded && incoming.length) setExpanded(incoming[0].id);
    if (expanded && !incoming.some((x) => x.id === expanded)) setExpanded(incoming[0]?.id ?? null);
  }, [notebookRunsQuery.data, expanded]);

  useEffect(() => {
    if (queryHistoryQuery.data === undefined) return;
    setQueriesState(queryHistoryQuery.data.map(mapQueryDtoToRow));
  }, [queryHistoryQuery.data]);

  const onRerunQuery = async (row: QueryHistoryRow) => {
    setActionMsg(null);
    setBusyQuery({ type: "rerun", id: row.id });
    const notebookId = row.notebookId;
    if (!notebookId) {
      setActionMsg("Не удалось определить сценарий для перезапуска запроса.");
      setBusyQuery(null);
      return;
    }
    try {
      await runAnalyticsPipeline(notebookId, row.label);
      setActionMsg(`Запрос "${row.label}" перезапущен.`);
    } catch {
      setActionMsg(`Не удалось перезапустить запрос "${row.label}".`);
    } finally {
      setBusyQuery(null);
    }
  };

  const onSaveQueryAsReport = async (row: QueryHistoryRow) => {
    setActionMsg(null);
    setBusyQuery({ type: "report", id: row.id });
    const notebookId = row.notebookId;
    const ws = workspaceQuery.data;
    const hint = row.saveAsReportBodyHint as Record<string, string> | undefined;
    try {
      const created = await createReport.mutateAsync({
        workspace_id: (hint?.workspace_id ?? ws) as string,
        title: (hint?.title ?? `Отчет: ${row.label}`).slice(0, 500),
        notebook_id: hint?.notebook_id ?? notebookId,
        source_cell_id: hint?.source_cell_id,
        payload: {
          prompt: row.label,
          generated_sql: row.sqlPreview,
          interpreted_query: row.interpretedSummary,
          chart_type: row.chartType,
          result_metadata: { source: "history", validation: row.validationHint },
          captured_at: new Date().toISOString()
        }
      });
      upsertReportSnapshot({
        report_id: created.id,
        report_name: created.title,
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
      setBusyQuery(null);
    }
  };

  const onSaveRunAsReport = async (row: NotebookRunRow) => {
    setActionMsg(null);
    const ws = workspaceQuery.data;
    if (!ws) {
      setActionMsg("Нужен доступ для сохранения отчета.");
      return;
    }
    setBusyRun({ type: "report", id: row.id });
    try {
      const title = `Запуск: ${row.notebookTitle} · ${row.ranAt}`;
      const created = await createReport.mutateAsync({
        workspace_id: ws,
        title: title.slice(0, 500),
        notebook_id: row.notebookId,
        source_cell_id: null,
        payload: {
          prompt: `Запуск сценария «${row.notebookTitle}»`,
          interpreted_query: row.traceSummary.slice(0, 500),
          result_metadata: {
            source: "notebook_run_history",
            run_id: row.id,
            validation: row.validationHint,
            status: row.status
          },
          trace_summary: row.traceSummary,
          captured_at: new Date().toISOString()
        }
      });
      upsertReportSnapshot({
        report_id: created.id,
        report_name: created.title,
        notebook_id: row.notebookId,
        prompt: title,
        sql: "",
        insight: row.traceSummary,
        warnings: row.validationOk ? [] : [row.validationHint],
        confidence: row.validationOk ? 0.85 : 0.55,
        created_at: new Date().toISOString()
      });
      setActionMsg(`Отчёт по запуску «${row.notebookTitle}» сохранён.`);
    } catch {
      setActionMsg("Не удалось сохранить отчёт по запуску сценария.");
    } finally {
      setBusyRun(null);
    }
  };

  const onRerunRun = async (row: NotebookRunRow) => {
    setActionMsg(null);
    setBusyRun({ type: "rerun", id: row.id });
    try {
      await runAnalyticsPipeline(row.notebookId, `Перезапуск из истории · ${row.notebookTitle}`);
      setActionMsg(`Сценарий «${row.notebookTitle}» перезапущен.`);
    } catch {
      setActionMsg(`Не удалось перезапустить «${row.notebookTitle}».`);
    } finally {
      setBusyRun(null);
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
          { label: "Отчеты", href: "/reports", hint: "Поднять запуск до отчета" }
        ]}
      />
      {notebookRunsQuery.isLoading || queryHistoryQuery.isLoading ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          Загружаем историю запусков...
        </div>
      ) : null}
      {notebookRunsQuery.isError || queryHistoryQuery.isError ? (
        <div className="rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger-bold">
          Не удалось загрузить историю (запуски сценариев и/или запросы). Проверьте вход в систему и доступ к данным,
          либо доступность backend.
        </div>
      ) : null}
      {actionMsg ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          {actionMsg}
        </div>
      ) : null}

      <div className="surface-section space-y-3 p-4">
        <div>
          <label htmlFor="hist-search" className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
            Фильтр (сценарии)
          </label>
          <input
            id="hist-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Название сценария, trace, SQL…"
            className="interactive-focus mt-1 w-full max-w-md rounded-control border border-border-subtle bg-surface-page px-3 py-2 text-sm focus:border-brand-400"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Поиск по промпту</label>
            <input
              value={histQ}
              onChange={(e) => setHistQ(e.target.value)}
              placeholder="Текст запроса…"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-page px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Дата с</label>
            <input
              type="date"
              value={histFrom}
              onChange={(e) => setHistFrom(e.target.value)}
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-page px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Дата по</label>
            <input
              type="date"
              value={histTo}
              onChange={(e) => setHistTo(e.target.value)}
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-page px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Тип запроса</label>
            <select
              value={histType}
              onChange={(e) => setHistType(e.target.value)}
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-page px-3 py-2 text-sm"
            >
              <option value="all">Все</option>
              <option value="trips_by_city">Поездки по городам</option>
              <option value="cancellations">Отмены</option>
              <option value="conversion">Конверсия / доли</option>
              <option value="avg_check">Средний чек</option>
              <option value="orders_trend">Динамика заказов</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Область</span>
          <div className="flex rounded-control border border-border-subtle bg-surface-muted p-0.5">
            {(
              [
                ["mine", "Только мои ноутбуки"],
                ["workspace", "Все данные"]
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setHistScope(key)}
                aria-pressed={histScope === key}
                className={`rounded-[6px] px-2.5 py-1 text-xs font-semibold ${
                  histScope === key ? "bg-surface-card text-brand-800 shadow-xs" : "text-foreground-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {!workspaceQuery.data ? (
            <span className="text-xs text-amber-800">Задайте NEXT_PUBLIC_DEFAULT_WORKSPACE_ID или войдите — нужен доступ для истории API.</span>
          ) : null}
        </div>
      </div>

      <SectionCard title="История запусков сценариев">
        <div className="space-y-3">
          {runs.map((row) => {
            const runBusy = busyRun?.id === row.id;
            return (
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
                    onClick={() => onRerunRun(row)}
                    disabled={runBusy}
                    className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-2 py-1 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted disabled:opacity-60"
                  >
                    {runBusy && busyRun?.type === "rerun" ? "Выполняется..." : "Перезапустить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSaveRunAsReport(row)}
                    disabled={runBusy || !workspaceQuery.data}
                    className="interactive-focus rounded-control border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-60"
                  >
                    {runBusy && busyRun?.type === "report" ? "Сохранение..." : "Сохранить как отчет"}
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
            );
          })}
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
              <div className="space-y-1 text-[11px] text-foreground-muted">
                {row.chartType ? (
                  <p>
                    <span className="font-semibold">График:</span> {row.chartType}
                  </p>
                ) : null}
                <p className="capitalize">
                  <span className="font-semibold">Исполнение:</span> {row.executionStatus ?? "—"}
                </p>
                {row.authorRoleKey ? (
                  <p>
                    <span className="font-semibold">Роль:</span> {row.authorRoleKey}
                  </p>
                ) : null}
                {row.confidence != null ? (
                  <p>
                    <span className="font-semibold">Confidence:</span> {Math.round(row.confidence * 100)}%
                  </p>
                ) : null}
                {row.resultSummary ? (
                  <p>
                    <span className="font-semibold">Инсайт:</span> {row.resultSummary.slice(0, 220)}
                    {row.resultSummary.length > 220 ? "…" : ""}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => onRerunQuery(row)}
                  disabled={busyQuery?.id === row.id}
                  className="interactive-focus rounded-control border border-border-subtle px-2 py-1.5 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted disabled:opacity-60"
                >
                  {busyQuery?.id === row.id && busyQuery.type === "rerun" ? "Выполняется..." : "Перезапустить"}
                </button>
                <button
                  type="button"
                  onClick={() => onSaveQueryAsReport(row)}
                  disabled={busyQuery?.id === row.id}
                  className="interactive-focus rounded-control border border-brand-200 bg-brand-50 px-2 py-1.5 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-60"
                >
                  {busyQuery?.id === row.id && busyQuery.type === "report" ? "Сохранение..." : "Сохранить отчет"}
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
          <table className="w-full min-w-[960px] border-collapse text-left text-body-sm">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                <th className="pb-2 pr-4">Время</th>
                <th className="pb-2 pr-4">Промпт</th>
                <th className="pb-2 pr-4">Intent</th>
                <th className="pb-2 pr-4">SQL</th>
                <th className="pb-2 pr-4">График</th>
                <th className="pb-2 pr-4">Роль</th>
                <th className="pb-2 pr-4">Conf</th>
                <th className="pb-2 pr-4">Инсайт</th>
                <th className="pb-2 pr-4">Валидация SQL</th>
                <th className="pb-2 pr-4">Исполнение</th>
                <th className="pb-2 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {queries.map((row) => (
                <tr key={row.id} className="hover:bg-surface-muted/40">
                  <td className="py-3 pr-4 tabular-nums text-foreground-secondary">{row.ranAt}</td>
                  <td className="py-3 pr-4 font-medium text-foreground">{row.label}</td>
                  <td className="max-w-[120px] py-3 pr-4 truncate text-xs text-foreground-secondary" title={JSON.stringify(row.parsedIntent ?? {})}>
                    {typeof row.parsedIntent?.intent === "string"
                      ? row.parsedIntent.intent
                      : (row.interpretedSummary ?? "—").slice(0, 48)}
                  </td>
                  <td className="py-3 pr-4 font-mono text-[11px] text-foreground-secondary">{row.sqlPreview}</td>
                  <td className="py-3 pr-4 text-xs text-foreground-secondary">{row.chartType ?? "—"}</td>
                  <td className="py-3 pr-4 text-xs text-foreground-secondary">{row.authorRoleKey ?? "—"}</td>
                  <td className="py-3 pr-4 tabular-nums text-xs text-foreground-secondary">
                    {row.confidence != null ? `${Math.round(row.confidence * 100)}%` : "—"}
                  </td>
                  <td
                    className="max-w-[160px] truncate py-3 pr-4 text-xs text-foreground-secondary"
                    title={row.resultSummary ?? ""}
                  >
                    {row.resultSummary ?? "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <ValidationBadge ok={row.validationOk} label={row.validationHint} />
                  </td>
                  <td className="py-3 pr-4 text-xs capitalize text-foreground-secondary">
                    {row.executionStatus ?? "—"}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onRerunQuery(row)}
                        disabled={busyQuery?.id === row.id}
                        className="interactive-focus rounded-control border border-border-subtle px-2 py-1 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted disabled:opacity-60"
                      >
                        {busyQuery?.id === row.id && busyQuery.type === "rerun" ? "Выполняется..." : "Перезапустить"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onSaveQueryAsReport(row)}
                        disabled={busyQuery?.id === row.id}
                        className="interactive-focus rounded-control border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-60"
                      >
                        {busyQuery?.id === row.id && busyQuery.type === "report" ? "Сохранение..." : "Сохранить отчет"}
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
