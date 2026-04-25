"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { useCurrentUser } from "@/hooks/api/use-auth";
import { useNotebookTemplates, useQueryTemplates, useQuickRunQueryTemplate } from "@/hooks/api/use-templates";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import type { UserRole } from "@/lib/types";
import type { NotebookTemplateRow, QueryTemplateRow } from "@/lib/system/mock-data";
import { MOCK_NOTEBOOK_TEMPLATES, MOCK_QUERY_TEMPLATES } from "@/lib/system/mock-data";
import type { QueryTemplateDto, QuickRunTemplateResultDto } from "@/types/api/templates";

const ROLE_ORDER: UserRole[] = ["admin", "manager", "marketer", "executive"];
const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  marketer: "Маркетолог",
  executive: "Руководитель"
};

function resolveTemplateTargets(targetRoleKey: unknown, ownerRole: unknown): UserRole[] {
  if (typeof targetRoleKey === "string" && ROLE_ORDER.includes(targetRoleKey as UserRole)) {
    return [targetRoleKey as UserRole];
  }
  if (typeof ownerRole === "string" && ROLE_ORDER.includes(ownerRole as UserRole)) {
    return [ownerRole as UserRole];
  }
  return [...ROLE_ORDER];
}

function pipelineHref(notebookId: string, nl: string): Route {
  return `/notebooks/${encodeURIComponent(notebookId)}?template_prompt=${encodeURIComponent(nl)}&autorun=1` as Route;
}

function groupByRole<T extends { role: UserRole }>(rows: T[]): Record<UserRole, T[]> {
  const out: Record<UserRole, T[]> = {
    admin: [],
    manager: [],
    marketer: [],
    executive: []
  };
  for (const row of rows) {
    out[row.role].push(row);
  }
  return out;
}

function groupQueryTemplatesByRole(rows: QueryTemplateDto[]): Record<UserRole, QueryTemplateDto[]> {
  const out: Record<UserRole, QueryTemplateDto[]> = {
    admin: [],
    manager: [],
    marketer: [],
    executive: []
  };
  for (const row of rows) {
    const targets = resolveTemplateTargets(row.target_role_key, row.role);
    for (const t of targets) {
      out[t].push(row);
    }
  }
  return out;
}

function groupMockQueryTemplates(rows: QueryTemplateRow[]): Record<UserRole, QueryTemplateRow[]> {
  const out: Record<UserRole, QueryTemplateRow[]> = {
    admin: [],
    manager: [],
    marketer: [],
    executive: []
  };
  for (const row of rows) {
    const targets = resolveTemplateTargets(row.target_role_key, row.role);
    for (const t of targets) {
      out[t].push(row);
    }
  }
  return out;
}

/** Сценарии на канве: те же роли, что и у «шаблонов запросов» (общий шаблон → все роли). */
function queryTemplatesToScenarioNotebookRows(rows: QueryTemplateDto[]): NotebookTemplateRow[] {
  const out: NotebookTemplateRow[] = [];
  for (const row of rows) {
    const targets = resolveTemplateTargets(row.target_role_key, row.role);
    const nb = row.default_notebook_id ?? "ops-health";
    const nl = (row.question ?? row.nl_prompt_template ?? row.name).trim();
    const href = pipelineHref(nb, nl);
    for (const t of targets) {
      out.push({
        id: `${row.id}-${t}`,
        name: row.name,
        description: (row.description || row.business_value || "Запуск сценария по шаблону").trim(),
        role: t,
        href
      });
    }
  }
  return out;
}

function TemplateCardTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-full border border-border-subtle bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-foreground-secondary"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function QueryTemplateCardMock({ row, sectionRole }: { row: QueryTemplateRow; sectionRole: UserRole }) {
  const title = row.title ?? row.name;
  const href = pipelineHref(row.notebookId, row.question);
  return (
    <article className="group flex min-h-[220px] min-w-0 flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-xs transition hover:border-brand-300 hover:shadow-md">
      <Link href={href} className="interactive-focus flex flex-1 flex-col p-4 text-left">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground group-hover:text-brand-900">{title}</h3>
          <span className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-900">
            {ROLE_LABEL[sectionRole]}
          </span>
        </div>
        <p className="mt-1 text-xs text-foreground-secondary">{row.description}</p>
        <p className="mt-2 text-xs leading-relaxed text-foreground">
          <span className="font-semibold text-foreground-muted">Вопрос: </span>
          {row.question}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-800">
            График: {row.expected_chart}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              row.reusable_scenario
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            {row.reusable_scenario ? "Повторяемый сценарий" : "Разовый анализ"}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-foreground-secondary">
          <span className="font-semibold text-foreground-muted">Ценность: </span>
          {row.business_value}
        </p>
        <TemplateCardTags tags={row.tags} />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Канонический SQL</p>
        <pre className="surface-console mt-1 max-h-24 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-[10px] leading-relaxed text-foreground-secondary">
          {row.sql}
        </pre>
        {row.interpretedIntent ? (
          <p className="mt-2 text-[11px] text-foreground-secondary">
            <span className="font-semibold text-foreground-muted">Интерпретация: </span>
            {row.interpretedIntent}
          </p>
        ) : null}
        {typeof row.confidenceScore === "number" ? (
          <p className="mt-1 text-[11px] text-foreground-secondary">
            <span className="font-semibold text-foreground-muted">Confidence: </span>
            {row.confidenceScore.toFixed(2)}
          </p>
        ) : null}
        {row.shortInsight ? (
          <p className="mt-1 text-[11px] text-foreground-secondary">
            <span className="font-semibold text-foreground-muted">Insight: </span>
            {row.shortInsight}
          </p>
        ) : null}
        {Array.isArray(row.explainabilityTrace) && row.explainabilityTrace.length > 0 ? (
          <div className="mt-2 rounded-control border border-border-subtle bg-surface-muted/40 p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Explainability trace</p>
            <ol className="mt-1 list-inside list-decimal space-y-0.5 text-[11px] text-foreground-secondary">
              {row.explainabilityTrace.slice(0, 7).map((step, idx) => (
                <li key={`${row.id}-trace-${idx}`}>{step}</li>
              ))}
            </ol>
          </div>
        ) : null}
        {Array.isArray(row.tableResultPreview) && row.tableResultPreview.length > 0 ? (
          <div className="mt-2 overflow-x-auto rounded-control border border-border-subtle bg-surface-card p-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Table result (preview)</p>
            <table className="w-full min-w-[340px] border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-b border-border-subtle text-foreground-muted">
                  {Object.keys(row.tableResultPreview[0]).slice(0, 4).map((k) => (
                    <th key={`${row.id}-hdr-${k}`} className="px-1.5 py-1 font-semibold">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {row.tableResultPreview.slice(0, 3).map((r, i) => (
                  <tr key={`${row.id}-r-${i}`} className="border-b border-border-subtle/70 last:border-b-0">
                    {Object.keys(row.tableResultPreview[0])
                      .slice(0, 4)
                      .map((k) => (
                        <td key={`${row.id}-c-${i}-${k}`} className="px-1.5 py-1 text-foreground-secondary">
                          {String(r[k] ?? "—")}
                        </td>
                      ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="mt-3 text-[11px] font-semibold text-brand-800">Нажмите карточку — запуск pipeline в сценарии →</p>
      </Link>
    </article>
  );
}

function QueryTemplateCardLive({
  row,
  workspaceId,
  sectionRole
}: {
  row: QueryTemplateDto;
  workspaceId: string;
  sectionRole: UserRole;
}) {
  const quickRun = useQuickRunQueryTemplate();
  const [msg, setMsg] = useState<string | null>(null);
  const [runSource, setRunSource] = useState<"sql" | "fallback" | null>(null);
  const [lastRun, setLastRun] = useState<QuickRunTemplateResultDto | null>(null);
  const [runningTemplateId, setRunningTemplateId] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const thisRunning = runningTemplateId === row.id;
  const nb = row.default_notebook_id ?? "ops-health";
  const nl = row.question?.trim() || row.nl_prompt_template || row.name;
  const scenarioHref = pipelineHref(nb, nl);
  const title = row.title?.trim() || row.name;
  const expectedChart = row.expected_chart?.trim() || row.default_chart_type || "—";
  const tags = row.tags ?? [];
  const businessValue = row.business_value?.trim() || row.description;

  useEffect(() => {
    if (!lastRun || runningTemplateId) return;
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lastRun, runningTemplateId]);

  return (
    <article className="flex min-h-[220px] min-w-0 flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-card shadow-xs transition hover:border-brand-300 hover:shadow-md">
      <Link href={scenarioHref} className="interactive-focus flex flex-1 flex-col p-4 text-left">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground hover:text-brand-900">{title}</h3>
          <span className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-900">
            {ROLE_LABEL[sectionRole]}
          </span>
        </div>
        {row.template_key ? (
          <p className="mt-0.5 text-[10px] font-mono text-foreground-muted">{row.template_key}</p>
        ) : null}
        <p className="mt-1 text-xs text-foreground-secondary">{row.description}</p>
        <p className="mt-2 text-xs leading-relaxed text-foreground">
          <span className="font-semibold text-foreground-muted">Вопрос: </span>
          {nl}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-800">
            График: {expectedChart}
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              row.reusable_scenario
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-amber-200 bg-amber-50 text-amber-950"
            }`}
          >
            {row.reusable_scenario ? "Повторяемый сценарий" : "Разовый анализ"}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-foreground-secondary">
          <span className="font-semibold text-foreground-muted">Ценность: </span>
          {businessValue}
        </p>
        <TemplateCardTags tags={tags} />
        <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">SQL / подсказка</p>
        <pre className="surface-console mt-1 max-h-24 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-all p-2 font-mono text-[10px] leading-relaxed text-foreground-secondary">
          {(row.sql_template && row.sql_template.trim()) || row.nl_prompt_template || row.sql}
        </pre>
        <p className="mt-3 text-[11px] font-semibold text-brand-800">Нажмите карточку — запуск pipeline в сценарии →</p>
      </Link>
      <div className="flex flex-col gap-2 border-t border-border-subtle bg-surface-muted/30 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={thisRunning}
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setMsg(null);
              setRunSource(null);
              setLastRun(null);
              setRunningTemplateId(row.id);
              try {
                const res = await quickRun.mutateAsync({ workspaceId, templateId: row.id });
                const usedFallback = (res.warnings ?? []).some((w) => w.toLowerCase().includes("sql template fallback"));
                setRunSource(usedFallback ? "fallback" : "sql");
                setLastRun(res);
                setMsg(
                  `Статус: ${res.execution_status}. График: ${res.chart_type}. ${res.insight?.slice(0, 140) ?? ""}`.trim()
                );
              } catch {
                setMsg("Не удалось выполнить шаблон через API.");
              } finally {
                setRunningTemplateId(null);
              }
            }}
            className="interactive-focus micro-lift rounded-control bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-black shadow-xs hover:bg-brand-400 disabled:opacity-50"
          >
            {thisRunning ? "Запуск…" : "Быстрый запуск (API)"}
          </button>
          <Link
            href={"/history" as Route}
            className="text-[11px] font-semibold text-foreground-secondary underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            История запусков
          </Link>
          {runSource ? (
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                runSource === "fallback"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
              }`}
            >
              {runSource === "fallback" ? "Источник: NL fallback" : "Источник: SQL template"}
            </span>
          ) : null}
        </div>
        {msg ? <p className="text-[11px] text-foreground-secondary">{msg}</p> : null}
        {lastRun?.execution_status === "clarification_required" ? (
          <Link
            href={scenarioHref}
            className="inline-flex w-fit rounded-control border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
          >
            Уточнить и запустить в сценарии
          </Link>
        ) : null}
      </div>
      {Array.isArray(lastRun?.table_records) && lastRun.table_records.length > 0 ? (
        <div ref={resultRef} className="overflow-x-auto border-t border-border-subtle bg-surface-card p-2">
          {lastRun.interpreted_intent ? (
            <p className="mb-1 text-[11px] text-foreground-secondary">
              <span className="font-semibold text-foreground-muted">Intent: </span>
              {lastRun.interpreted_intent}
            </p>
          ) : null}
          {lastRun.trace_summary ? (
            <p className="mb-1 text-[11px] text-foreground-secondary">
              <span className="font-semibold text-foreground-muted">Trace: </span>
              {lastRun.trace_summary}
            </p>
          ) : null}
          {Array.isArray(lastRun.explainability_trace) && lastRun.explainability_trace.length > 0 ? (
            <ol className="mb-2 list-inside list-decimal space-y-0.5 text-[11px] text-foreground-secondary">
              {lastRun.explainability_trace.slice(0, 5).map((step, idx) => (
                <li key={`live-trace-${row.id}-${idx}`}>{step}</li>
              ))}
            </ol>
          ) : null}
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">Превью результата</p>
          <table className="w-full min-w-[460px] border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-border-subtle text-foreground-muted">
                {Object.keys(lastRun.table_records[0] ?? {}).slice(0, 5).map((k) => (
                  <th key={k} className="px-2 py-1 font-semibold">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lastRun.table_records.slice(0, 4).map((r, idx) => (
                <tr key={idx} className="border-b border-border-subtle/70 last:border-b-0">
                  {Object.keys(lastRun.table_records?.[0] ?? {})
                    .slice(0, 5)
                    .map((k) => (
                      <td key={`${idx}-${k}`} className="px-2 py-1 text-foreground-secondary">
                        {String((r as Record<string, unknown>)[k] ?? "—")}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {lastRun && (!Array.isArray(lastRun.table_records) || lastRun.table_records.length === 0) ? (
        <div
          ref={resultRef}
          className="border-t border-border-subtle bg-surface-card px-3 py-2 text-[11px] text-foreground-secondary"
        >
          Запуск выполнен, но табличные строки не возвращены. Откройте сценарий для полного результата и trace.
        </div>
      ) : null}
    </article>
  );
}

function NotebookTemplateCard({ row }: { row: NotebookTemplateRow }) {
  return (
    <div className="surface-content min-w-0 bg-surface-page px-3 py-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{row.name}</p>
          <p className="mt-0.5 text-xs text-foreground-secondary">{row.description}</p>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row">
          <Link
            href={row.href as Route}
            className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-2.5 py-1 text-center text-[11px] font-semibold text-foreground-secondary hover:bg-surface-muted"
          >
            Открыть
          </Link>
          <Link
            href={row.href as Route}
            className="interactive-focus micro-lift inline-flex justify-center rounded-control bg-brand-500 px-2.5 py-1 text-center text-[11px] font-semibold text-black shadow-xs hover:bg-brand-400"
          >
            Быстрый запуск
          </Link>
        </div>
      </div>
    </div>
  );
}

export function TemplatesView() {
  const meQuery = useCurrentUser();
  const workspaceQuery = useWorkspaceId();
  const workspaceId = workspaceQuery.data;
  const templatesQuery = useQueryTemplates(workspaceId);
  const nbTemplatesQuery = useNotebookTemplates(workspaceId);
  const [roleView, setRoleView] = useState<"current" | "all">("current");

  const queryRowsLive = templatesQuery.data;
  const queryTemplatesForGroup = useMemo(() => {
    if (!workspaceId) return null;
    if (templatesQuery.isLoading) return null;
    const rows = queryRowsLive ?? [];
    return rows.length > 0 ? rows : null;
  }, [workspaceId, templatesQuery.isLoading, queryRowsLive]);

  const useLiveQueryTemplates = Boolean(workspaceId && queryTemplatesForGroup);

  const byQueryLiveGrouped = useMemo(
    () => (queryTemplatesForGroup ? groupQueryTemplatesByRole(queryTemplatesForGroup) : null),
    [queryTemplatesForGroup]
  );
  const byQueryMockGrouped = useMemo(() => groupMockQueryTemplates(MOCK_QUERY_TEMPLATES), []);

  const notebookRows = useMemo((): NotebookTemplateRow[] => {
    if (useLiveQueryTemplates && queryTemplatesForGroup) {
      return queryTemplatesToScenarioNotebookRows(queryTemplatesForGroup);
    }
    const d = nbTemplatesQuery.data;
    if (d && d.length > 0) {
      return d.map((x) => ({
        id: x.id,
        name: x.name,
        description: x.description,
        role: x.role,
        href: `/notebooks/${x.notebook_id}` as Route
      }));
    }
    return MOCK_NOTEBOOK_TEMPLATES;
  }, [useLiveQueryTemplates, queryTemplatesForGroup, nbTemplatesQuery.data]);

  const byNb = groupByRole(notebookRows);
  const currentRole = (meQuery.data?.role as UserRole | undefined) ?? null;
  const visibleRoles = useMemo<UserRole[]>(
    () => (roleView === "current" && currentRole ? [currentRole] : ROLE_ORDER),
    [roleView, currentRole]
  );

  return (
    <div className="min-w-0 max-w-full space-y-8">
      <SystemPageIntro
        title="Шаблоны"
        subtitle="NL- и SQL-шаблоны, быстрый запуск через API и заготовки сценариев."
      />
      <DemoQuickActions
        items={[
          { label: "Открыть сценарии", href: "/notebooks", hint: "Продолжить на канве сценария" },
          { label: "Открыть словарь", href: "/dictionary", hint: "Проверить семантические определения" },
          { label: "Открыть историю", href: "/history", hint: "Просмотреть прошлые запуски шаблонов" }
        ]}
      />

      {!workspaceId ? (
        <div className="min-w-0 break-words rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          Контекст не задан (войдите в систему или укажите{" "}
          <code className="break-all rounded bg-surface-muted px-1 py-0.5 text-xs">
            NEXT_PUBLIC_DEFAULT_WORKSPACE_ID
          </code>
          ). Ниже показан каталог по умолчанию; для живых шаблонов нужен доступ к данным.
        </div>
      ) : null}

      {workspaceId && templatesQuery.isLoading ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          Загружаем шаблоны запросов…
        </div>
      ) : null}

      {workspaceId && templatesQuery.isError ? (
        <div className="rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger-bold">
          Не удалось загрузить шаблоны. Показан каталог по умолчанию.
        </div>
      ) : null}

      <div className="rounded-card border border-border-subtle bg-surface-card p-2 shadow-xs">
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
          Отображение ролей
        </p>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setRoleView("current")}
            aria-pressed={roleView === "current"}
            disabled={!currentRole}
            className={`rounded-control px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              roleView === "current" ? "bg-brand-50 text-brand-900 shadow-xs" : "text-foreground-secondary hover:bg-surface-muted"
            }`}
          >
            Только моя роль{currentRole ? ` (${ROLE_LABEL[currentRole]})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setRoleView("all")}
            aria-pressed={roleView === "all"}
            className={`rounded-control px-3 py-1.5 text-xs font-semibold ${
              roleView === "all" ? "bg-brand-50 text-brand-900 shadow-xs" : "text-foreground-secondary hover:bg-surface-muted"
            }`}
          >
            Все роли
          </button>
        </div>
      </div>

      <SectionCard
        title="Шаблоны запросов"
        description={
          workspaceId && queryTemplatesForGroup
            ? "Шаблоны из API для выбранного контекста (POST /templates/{id}/run)."
            : "Локальные заготовки до появления контекста или при пустом ответе API."
        }
      >
        <div className="space-y-8">
          {visibleRoles.map((role) => (
            <div key={role}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-800">
                {ROLE_LABEL[role]}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {(useLiveQueryTemplates ? byQueryLiveGrouped![role] : byQueryMockGrouped[role]).map((row) =>
                  useLiveQueryTemplates ? (
                    <QueryTemplateCardLive
                      key={`${row.id}-${role}`}
                      row={row as QueryTemplateDto}
                      workspaceId={workspaceId!}
                      sectionRole={role}
                    />
                  ) : (
                    <QueryTemplateCardMock
                      key={`${row.id}-${role}`}
                      row={row as QueryTemplateRow}
                      sectionRole={role}
                    />
                  )
                )}
                {(useLiveQueryTemplates ? byQueryLiveGrouped![role] : byQueryMockGrouped[role]).length === 0 ? (
                  <p className="text-xs text-foreground-muted">Для этой роли нет шаблонов запросов.</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Шаблоны сценариев" description="Готовые канвы под рабочие сценарии.">
        <div className="space-y-8">
          {visibleRoles.map((role) => (
            <div key={`nb-${role}`}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-800">
                {ROLE_LABEL[role]}
              </h3>
              <div className="space-y-2">
                {byNb[role].map((row) => (
                  <NotebookTemplateCard key={row.id} row={row} />
                ))}
                {byNb[role].length === 0 ? (
                  <p className="text-xs text-foreground-muted">Для этой роли нет шаблонов сценариев.</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
