"use client";

import type { Route } from "next";
import Link from "next/link";
import { AdminCorrectionsQueue } from "@/components/dashboard/admin-corrections-queue";
import { useDashboardSuggestions } from "@/hooks/api/use-dashboard";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import { SectionCard } from "@/components/dashboard/section-card";

export function AdminDemoFlows() {
  const workspaceQuery = useWorkspaceId();
  const ws = workspaceQuery.data;
  const suggQ = useDashboardSuggestions(ws, "admin");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AdminCorrectionsQueue />

      <SectionCard title="Подсказки для дашборда" description="Ролевые точки входа, сгенерированные по истории аналитики.">
        {suggQ.isLoading ? (
          <p className="text-sm text-foreground-muted">Загрузка подсказок…</p>
        ) : suggQ.isError ? (
          <div className="space-y-2">
            <p className="text-sm text-danger">Не удалось загрузить подсказки.</p>
            <button
              type="button"
              onClick={() => suggQ.refetch()}
              className="rounded-control border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted"
            >
              Повторить
            </button>
          </div>
        ) : (suggQ.data?.suggestions ?? []).length === 0 ? (
          <p className="text-sm text-foreground-muted">Для этой роли пока нет подсказок.</p>
        ) : (
          <div className="space-y-2">
            {suggQ.data?.suggestions.map((s) => (
              <Link
                key={s.id}
                href={s.href as Route}
                className="interactive-focus block rounded-control border border-border-subtle bg-surface-page px-3 py-2.5 transition hover:border-brand-200 hover:bg-brand-50/30"
              >
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <p className="mt-0.5 text-xs text-foreground-secondary">{s.description}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                  {s.kind} · открыть →
                </p>
              </Link>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
