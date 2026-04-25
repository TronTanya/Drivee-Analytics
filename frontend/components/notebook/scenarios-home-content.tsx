"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NotebookErrorBanner, NotebookLoadingState } from "@/components/notebook/notebook-states";
import { queryKeys } from "@/hooks/api/query-keys";
import { useCreateNotebook } from "@/hooks/api/use-notebooks";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { useSession } from "@/lib/auth/session-context";
import { fetchNotebooks, isDemoModeEnabled, updateNotebook } from "@/lib/api";
import { canAccessPath } from "@/lib/navigation/config";
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

export function ScenariosHomeContent() {
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useSession();
  const workspaceQuery = useWorkspaceId();
  const createNotebook = useCreateNotebook();
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [listNotice, setListNotice] = useState<string | null>(null);
  const canTemplates = canAccessPath(session.role, "/templates");

  const renameMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => updateNotebook(id, { title }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.notebooks.list() });
      setRenameId(null);
      setListNotice("Название обновлено.");
    },
    onError: () => {
      setListNotice("Не удалось сохранить имя. Проверьте авторизацию и доступ.");
    }
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.notebooks.list(),
    queryFn: fetchNotebooks,
    placeholderData: MOCK_NOTEBOOKS
  });
  const notebooks = (data ?? []).filter((n) => !n.role_hint || n.role_hint === session.role);

  const startRename = (notebook: NotebookListItem) => {
    setListNotice(null);
    setRenameId(notebook.id);
    setRenameDraft(notebook.title);
  };

  const submitRename = (id: string) => {
    const t = renameDraft.trim();
    if (!t) {
      setListNotice("Введите непустое название.");
      return;
    }
    setListNotice(null);
    renameMutation.mutate({ id, title: t });
  };

  const handleNewScenario = async () => {
    setListNotice(null);
    const openLocalDemoScenario = () => {
      const localId = `demo-${Date.now()}`;
      router.push(`/notebooks/${localId}` as Route);
      setListNotice("Создан локальный сценарий (без записи в БД).");
    };
    const wid = workspaceQuery.data;
    if (!wid && !isDemoModeEnabled()) {
      setListNotice("Нужен доступ: войдите в систему.");
      return;
    }
    try {
      const nb = await createNotebook.mutateAsync({
        title: `Новый сценарий · ${new Date().toLocaleString("ru-RU")}`,
        ...(wid ? { workspace_id: wid } : {})
      });
      router.push(`/notebooks/${nb.id}` as Route);
    } catch {
      if (isDemoModeEnabled()) {
        openLocalDemoScenario();
        return;
      }
      setListNotice("Не удалось создать сценарий. Повторите после входа в систему.");
    }
  };

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleNewScenario()}
          disabled={createNotebook.isPending || workspaceQuery.isLoading}
          className="shrink-0 rounded-control border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-900 shadow-xs hover:bg-brand-100 disabled:opacity-50"
        >
          {createNotebook.isPending ? "Создание…" : "Новый сценарий"}
        </button>
      </div>

      {listNotice ? (
        <p className="rounded-card border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800">{listNotice}</p>
      ) : null}

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
              Создайте новый сценарий
              {canTemplates ? " или откройте раздел шаблонов — готовые сценарии появятся здесь после загрузки с сервера." : "."}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <button
                type="button"
                onClick={() => void handleNewScenario()}
                className="rounded-control border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-100"
              >
                Новый сценарий
              </button>
              {canTemplates ? (
                <Link
                  href={"/templates" as Route}
                  className="rounded-control border border-border-subtle bg-surface-muted px-3 py-1.5 text-xs font-semibold text-foreground-secondary hover:bg-brand-50 hover:text-brand-800"
                >
                  Открыть шаблоны
                </Link>
              ) : null}
            </div>
          </div>
        ) : (
          notebooks.map((notebook) => (
            <div
              key={notebook.id}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-100 sm:flex-row sm:items-start sm:justify-between"
            >
              {renameId === notebook.id ? (
                <div className="min-w-0 flex-1 space-y-2" onClick={(e) => e.stopPropagation()}>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Название сценария</label>
                  <input
                    type="text"
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    className="w-full rounded-control border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-xs"
                    autoFocus
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={renameMutation.isPending}
                      onClick={() => submitRename(notebook.id)}
                      className="rounded-control border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-50"
                    >
                      {renameMutation.isPending ? "Сохранение…" : "Сохранить"}
                    </button>
                    <button
                      type="button"
                      disabled={renameMutation.isPending}
                      onClick={() => {
                        setRenameId(null);
                        setRenameDraft("");
                      }}
                      className="rounded-control border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <Link href={`/notebooks/${notebook.id}` as Route} className="min-w-0 flex-1 rounded-xl outline-none ring-brand-200 focus-visible:ring-2">
                  <p className="text-lg font-medium text-slate-900">{notebook.title}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {notebook.notebook_status ?? "active"} · {formatDateUtc(notebook.updated_at ?? notebook.created_at)}
                  </p>
                </Link>
              )}
              {renameId !== notebook.id ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      startRename(notebook);
                    }}
                    className="rounded-control border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    Переименовать
                  </button>
                  <Link
                    href={`/notebooks/${notebook.id}` as Route}
                    className="rounded-control border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-brand-200 hover:text-brand-800"
                  >
                    Открыть
                  </Link>
                </div>
              ) : null}
            </div>
          ))
        )}
      </section>
    </>
  );
}
