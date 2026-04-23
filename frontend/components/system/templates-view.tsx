"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { useNotebookTemplates, useQueryTemplates, useQuickRunQueryTemplate } from "@/hooks/api/use-templates";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import type { UserRole } from "@/lib/types";
import type { NotebookTemplateRow, QueryTemplateRow } from "@/lib/system/mock-data";
import { MOCK_NOTEBOOK_TEMPLATES, MOCK_QUERY_TEMPLATES } from "@/lib/system/mock-data";
import type { QueryTemplateDto } from "@/types/api/templates";

const ROLE_ORDER: UserRole[] = ["admin", "manager", "marketer", "executive"];
const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  marketer: "Маркетолог",
  executive: "Руководитель"
};

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

function QuickRunButton({ href, label }: { href: Route; label: string }) {
  return (
    <Link
      href={href}
      className="interactive-focus micro-lift inline-flex w-full justify-center rounded-control bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-black shadow-xs hover:bg-brand-400 active:translate-y-0 sm:w-auto"
    >
      {label}
    </Link>
  );
}

function QueryTemplateCardMock({ row }: { row: QueryTemplateRow }) {
  return (
    <div className="surface-content bg-surface-page px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{row.name}</p>
          <p className="mt-0.5 text-xs text-foreground-secondary">{row.description}</p>
          <pre className="surface-console mt-2 max-h-20 overflow-auto p-2 font-mono text-[10px]">
            {row.sql}
          </pre>
        </div>
        <div className="w-full sm:w-auto">
          <QuickRunButton href={row.runHref} label="Быстрый запуск" />
        </div>
      </div>
    </div>
  );
}

function QueryTemplateCardLive({ row, workspaceId }: { row: QueryTemplateDto; workspaceId: string }) {
  const quickRun = useQuickRunQueryTemplate();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="surface-content bg-surface-page px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{row.name}</p>
          {row.template_key ? (
            <p className="mt-0.5 text-[10px] font-mono text-foreground-muted">{row.template_key}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-foreground-secondary">{row.description}</p>
          <pre className="surface-console mt-2 max-h-24 overflow-auto p-2 font-mono text-[10px]">
            {(row.sql_template && row.sql_template.trim()) || row.nl_prompt_template || row.sql}
          </pre>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <button
            type="button"
            disabled={quickRun.isPending}
            onClick={async () => {
              setMsg(null);
              try {
                const res = await quickRun.mutateAsync({ workspaceId, templateId: row.id });
                setMsg(
                  `Статус: ${res.execution_status}. График: ${res.chart_type}. ${res.insight?.slice(0, 140) ?? ""}`.trim()
                );
              } catch {
                setMsg("Не удалось выполнить шаблон через API.");
              }
            }}
            className="interactive-focus micro-lift rounded-control bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-black shadow-xs hover:bg-brand-400 disabled:opacity-50"
          >
            {quickRun.isPending ? "Запуск…" : "Быстрый запуск (API)"}
          </button>
          <Link
            href={"/history" as Route}
            className="text-center text-[11px] font-semibold text-brand-800 underline-offset-2 hover:underline"
          >
            История запусков
          </Link>
          {msg ? <p className="max-w-xs text-[11px] text-foreground-secondary">{msg}</p> : null}
        </div>
      </div>
    </div>
  );
}

function NotebookTemplateCard({ row }: { row: NotebookTemplateRow }) {
  return (
    <div className="surface-content bg-surface-page px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
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
          <QuickRunButton href={row.href as Route} label="Быстрый запуск" />
        </div>
      </div>
    </div>
  );
}

export function TemplatesView() {
  const workspaceQuery = useWorkspaceId();
  const workspaceId = workspaceQuery.data;
  const templatesQuery = useQueryTemplates(workspaceId);
  const nbTemplatesQuery = useNotebookTemplates();

  const queryRowsLive = templatesQuery.data;
  const queryTemplatesForGroup = useMemo(() => {
    if (!workspaceId) return null;
    if (templatesQuery.isLoading) return null;
    const rows = queryRowsLive ?? [];
    return rows.length > 0 ? rows : null;
  }, [workspaceId, templatesQuery.isLoading, queryRowsLive]);

  const useLiveQueryTemplates = Boolean(workspaceId && queryTemplatesForGroup);

  const byQueryLiveGrouped = useMemo(
    () => (queryTemplatesForGroup ? groupByRole(queryTemplatesForGroup) : null),
    [queryTemplatesForGroup]
  );
  const byQueryMockGrouped = useMemo(() => groupByRole(MOCK_QUERY_TEMPLATES), []);

  const notebookRows = useMemo((): NotebookTemplateRow[] => {
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
  }, [nbTemplatesQuery.data]);

  const byNb = groupByRole(notebookRows);

  return (
    <div className="space-y-8">
      <SystemPageIntro
        title="Шаблоны"
        subtitle="NL- и SQL-шаблоны workspace, быстрый запуск через API и заготовки сценариев."
      />
      <DemoQuickActions
        items={[
          { label: "Открыть сценарии", href: "/notebooks", hint: "Продолжить на канве сценария" },
          { label: "Открыть словарь", href: "/dictionary", hint: "Проверить семантические определения" },
          { label: "Открыть историю", href: "/history", hint: "Просмотреть прошлые запуски шаблонов" }
        ]}
      />

      {!workspaceId ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          Workspace не задан (войдите в систему или укажите{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_DEFAULT_WORKSPACE_ID</code>
          ). Ниже показан демо-каталог; для живых шаблонов нужен workspace.
        </div>
      ) : null}

      {workspaceId && templatesQuery.isLoading ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          Загружаем шаблоны запросов…
        </div>
      ) : null}

      {workspaceId && templatesQuery.isError ? (
        <div className="rounded-card border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger-bold">
          Не удалось загрузить шаблоны workspace. Показан демо-каталог.
        </div>
      ) : null}

      <SectionCard
        title="Шаблоны запросов"
        description={
          workspaceId && queryTemplatesForGroup
            ? "Шаблоны из API для выбранного workspace (POST /templates/{id}/run)."
            : "Демо-заготовки до появления workspace или при пустом ответе API."
        }
      >
        <div className="space-y-8">
          {ROLE_ORDER.map((role) => (
            <div key={role}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-800">
                {ROLE_LABEL[role]}
              </h3>
              <div className="space-y-2">
                {(useLiveQueryTemplates ? byQueryLiveGrouped![role] : byQueryMockGrouped[role]).map((row) =>
                  useLiveQueryTemplates ? (
                    <QueryTemplateCardLive key={row.id} row={row as QueryTemplateDto} workspaceId={workspaceId!} />
                  ) : (
                    <QueryTemplateCardMock key={row.id} row={row as QueryTemplateRow} />
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
          {ROLE_ORDER.map((role) => (
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
