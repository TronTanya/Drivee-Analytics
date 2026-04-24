"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCorrections, useUpdateCorrectionStatus } from "@/hooks/api/use-corrections";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import type { CorrectionStatusDto } from "@/types/api/corrections";
import { SectionCard } from "@/components/dashboard/section-card";

const STATUS_ORDER: CorrectionStatusDto[] = ["pending", "approved", "published", "rejected"];

function statusCls(status: CorrectionStatusDto): string {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "published") return "border-brand-200 bg-brand-50 text-brand-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

/** Очередь learned SQL-коррекций (только admin в API). */
export function AdminCorrectionsQueue() {
  const workspaceQuery = useWorkspaceId();
  const ws = workspaceQuery.data;
  const correctionsQ = useCorrections(ws);
  const updateStatus = useUpdateCorrectionStatus();
  const isUpdating = updateStatus.isPending ? updateStatus.variables?.id : null;
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const pendingCount = useMemo(
    () => (correctionsQ.data ?? []).filter((c) => c.status === "pending").length,
    [correctionsQ.data]
  );

  return (
    <SectionCard
      title="Очередь проверки исправлений"
      description="Подтверждайте или отклоняйте learned SQL-исправления перед публикацией."
      action={
        <span className="rounded-full border border-border-subtle bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-foreground-secondary">
          В ожидании: {pendingCount}
        </span>
      }
    >
      {toast ? (
        <div
          className={`mb-2 rounded-control border px-3 py-2 text-xs font-semibold ${
            toast.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
      {correctionsQ.isLoading ? (
        <p className="text-sm text-foreground-muted">Загрузка исправлений…</p>
      ) : correctionsQ.isError ? (
        <div className="space-y-2">
          <p className="text-sm text-danger">Не удалось загрузить исправления.</p>
          <button
            type="button"
            onClick={() => correctionsQ.refetch()}
            className="rounded-control border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted"
          >
            Повторить
          </button>
        </div>
      ) : (correctionsQ.data ?? []).length === 0 ? (
        <p className="text-sm text-foreground-muted">Пока нет предложенных исправлений.</p>
      ) : (
        <ul className="space-y-2">
          {(correctionsQ.data ?? [])
            .slice()
            .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status))
            .map((row) => (
              <li key={row.id} className="surface-content bg-surface-page px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{row.summary}</p>
                    <p className="mt-1 text-xs text-foreground-secondary">{row.proposed_fix}</p>
                    {row.notebook_id ? (
                      <Link
                        href={`/notebooks/${row.notebook_id}` as Route}
                        className="interactive-focus mt-1 inline-block rounded-control px-0.5 text-[11px] font-semibold text-brand-700 hover:text-brand-900 hover:underline"
                      >
                        Открыть исходный сценарий
                      </Link>
                    ) : null}
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${statusCls(row.status)}`}>
                    {row.status}
                  </span>
                </div>
                {row.status === "pending" && row.lifecycle !== "record" ? (
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      disabled={isUpdating === row.id}
                      onClick={() =>
                        updateStatus.mutate(
                          { id: row.id, status: "approved" },
                          {
                            onSuccess: () => setToast({ kind: "success", text: "Статус обновлен: approved." }),
                            onError: () => setToast({ kind: "error", text: "Не удалось обновить статус." })
                          }
                        )
                      }
                      className="interactive-focus rounded-control border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                    >
                      {isUpdating === row.id ? "Сохранение..." : "Подтвердить"}
                    </button>
                    <button
                      type="button"
                      disabled={isUpdating === row.id}
                      onClick={() =>
                        updateStatus.mutate(
                          { id: row.id, status: "rejected" },
                          {
                            onSuccess: () => setToast({ kind: "success", text: "Статус обновлен: rejected." }),
                            onError: () => setToast({ kind: "error", text: "Не удалось обновить статус." })
                          }
                        )
                      }
                      className="interactive-focus rounded-control border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-60"
                    >
                      {isUpdating === row.id ? "Сохранение..." : "Отклонить"}
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
        </ul>
      )}
    </SectionCard>
  );
}
