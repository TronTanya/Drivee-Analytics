"use client";

import type { Route } from "next";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { NotebookPageLayout } from "@/components/notebook/notebook-page-layout";
import { NotebookErrorBanner, NotebookLoadingState } from "@/components/notebook/notebook-states";
import { queryKeys } from "@/hooks/api/query-keys";
import { fetchNotebooks } from "@/lib/api";
import type { NotebookListItem } from "@/lib/types";

const MOCK_BASE_TS = Date.UTC(2026, 3, 22, 4, 0, 0);

const MOCK_NOTEBOOKS: NotebookListItem[] = [
  {
    id: "nbk-demo-1",
    title: "Недельная динамика заказов по регионам",
    notebook_status: "active",
    created_at: new Date(MOCK_BASE_TS).toISOString(),
    updated_at: new Date(MOCK_BASE_TS).toISOString()
  },
  {
    id: "ops-health",
    title: "Ops Health — clarification + follow-up",
    notebook_status: "active",
    created_at: new Date(MOCK_BASE_TS - 86_400_000).toISOString(),
    updated_at: new Date(MOCK_BASE_TS - 20_000_000).toISOString()
  },
  {
    id: "strategy-board",
    title: "Strategy Board — режим прогноза",
    notebook_status: "active",
    created_at: new Date(MOCK_BASE_TS - 172_800_000).toISOString(),
    updated_at: new Date(MOCK_BASE_TS - 40_000_000).toISOString()
  }
];

function formatDateUtc(iso: string): string {
  const date = new Date(iso);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const min = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} ${hh}:${min} UTC`;
}

export default function NotebooksPage() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.notebooks.list(),
    queryFn: fetchNotebooks,
    placeholderData: MOCK_NOTEBOOKS
  });
  const notebooks = data ?? [];

  return (
    <NotebookPageLayout
      title="Сценарии"
      subtitle="Основной аналитический workflow в формате пошаговых ячеек."
    >
      <DemoQuickActions
        title="Ссылки на сценарии"
        items={[
          { label: "Main demo", href: "/notebooks/ops-health", hint: "NL -> SQL -> Table/Chart -> Save report" },
          { label: "Clarification", href: "/notebooks/clarification-demo", hint: "Сценарий с уточнением метрики" },
          { label: "Follow-up", href: "/notebooks/follow-up-demo", hint: "Уточняющий вопрос по городу/периоду" },
          { label: "Reuse", href: "/reports", hint: "Повторный запуск и переиспользование отчета" }
        ]}
      />

      {isLoading ? <NotebookLoadingState label="Загрузка сценариев…" /> : null}
      {isError ? (
        <NotebookErrorBanner
          title="Не удалось загрузить сценарии"
          message="Fallback без сервера недоступен. Повторите попытку, чтобы восстановить список."
          onRetry={() => refetch()}
        />
      ) : null}

      <section className="space-y-3">
        {!isLoading && notebooks.length === 0 ? (
          <div className="rounded-card border border-dashed border-border-subtle bg-surface-card px-6 py-12 text-center shadow-xs">
            <p className="text-sm font-semibold text-foreground">Пока нет сценариев</p>
            <p className="mt-1 text-sm text-foreground-secondary">
              Начните с шаблонов или откройте стратегический сценарий.
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Link
                href={"/templates" as Route}
                className="rounded-control border border-border-subtle bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground-secondary hover:bg-brand-50 hover:text-brand-800"
              >
                Открыть шаблоны
              </Link>
              <Link
                href={"/notebooks/strategy-board" as Route}
                className="rounded-control border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
              >
                Открыть сценарий
              </Link>
            </div>
          </div>
        ) : (
          notebooks.map((notebook) => (
            <Link
              key={notebook.id}
              href={`/notebooks/${notebook.id}` as Route}
              className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-100 hover:bg-brand-50"
            >
              <p className="text-lg font-medium text-slate-900">{notebook.title}</p>
              <p className="mt-1 text-sm text-slate-600">
                {notebook.notebook_status ?? "active"} · {formatDateUtc(notebook.created_at)}
              </p>
            </Link>
          ))
        )}
      </section>
    </NotebookPageLayout>
  );
}
