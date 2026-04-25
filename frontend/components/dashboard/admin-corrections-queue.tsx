"use client";

import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useCorrections, useCreateCorrection, useUpdateCorrectionStatus } from "@/hooks/api/use-corrections";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import type { CorrectionStatusDto, CorrectionTypeApiDto } from "@/types/api/corrections";
import { SectionCard } from "@/components/dashboard/section-card";

const STATUS_ORDER: CorrectionStatusDto[] = ["pending", "approved", "published", "rejected"];

function statusCls(status: CorrectionStatusDto): string {
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "approved") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "published") return "border-brand-200 bg-brand-50 text-brand-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function splitTerms(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Очередь learned SQL-коррекций (только admin в API). */
export function AdminCorrectionsQueue() {
  const workspaceQuery = useWorkspaceId();
  const ws = workspaceQuery.data;
  const correctionsQ = useCorrections(ws);
  const createMutation = useCreateCorrection();
  const updateStatus = useUpdateCorrectionStatus();
  const isUpdating = updateStatus.isPending ? updateStatus.variables?.id : null;
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [originalQuery, setOriginalQuery] = useState("");
  const [generatedSql, setGeneratedSql] = useState("");
  const [correctedSql, setCorrectedSql] = useState("");
  const [correctionType, setCorrectionType] = useState<CorrectionTypeApiDto>("sql_rewrite");
  const [semanticBefore, setSemanticBefore] = useState("");
  const [semanticAfter, setSemanticAfter] = useState("");
  const [notes, setNotes] = useState("");

  const pendingCount = useMemo(
    () => (correctionsQ.data ?? []).filter((c) => c.status === "pending").length,
    [correctionsQ.data]
  );

  const canCreate =
    Boolean(ws?.trim()) &&
    originalQuery.trim().length > 0 &&
    generatedSql.trim().length > 0 &&
    correctedSql.trim().length > 0;

  const resetCreateForm = () => {
    setOriginalQuery("");
    setGeneratedSql("");
    setCorrectedSql("");
    setCorrectionType("sql_rewrite");
    setSemanticBefore("");
    setSemanticAfter("");
    setNotes("");
  };

  const handleCreateCorrection = async () => {
    if (!ws?.trim() || !canCreate) return;
    setToast(null);
    try {
      await createMutation.mutateAsync({
        workspace_id: ws.trim(),
        original_query: originalQuery.trim(),
        generated_sql: generatedSql.trim(),
        corrected_sql: correctedSql.trim(),
        correction_type: correctionType,
        semantic_terms_before: splitTerms(semanticBefore),
        semantic_terms_after: splitTerms(semanticAfter),
        notes: notes.trim() ? notes.trim() : null
      });
      setToast({ kind: "success", text: "Исправление добавлено в библиотеку workspace." });
      resetCreateForm();
    } catch {
      setToast({ kind: "error", text: "Не удалось сохранить исправление (проверьте поля и права admin)." });
    }
  };

  return (
    <div className="space-y-6">
      {toast ? (
        <div
          className={`rounded-control border px-3 py-2 text-xs font-semibold ${
            toast.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
          }`}
        >
          {toast.text}
        </div>
      ) : null}
    <SectionCard
      title="Добавить своё исправление"
      description="Ручная запись в learned-библиотеку: исходный вопрос, сгенерированный SQL и исправленный вариант (POST /admin/corrections)."
    >
      {workspaceQuery.isPending ? (
        <p className="text-sm text-foreground-muted">Определяем workspace…</p>
      ) : !ws ? (
        <p className="text-sm text-amber-900">
          Не задан workspace (нужен UUID в профиле или{" "}
          <code className="rounded bg-surface-muted px-1 font-mono text-xs">NEXT_PUBLIC_DEFAULT_WORKSPACE_ID</code>).
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreateCorrection();
          }}
        >
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Тип</label>
            <select
              value={correctionType}
              onChange={(e) => setCorrectionType(e.target.value as CorrectionTypeApiDto)}
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-sm"
            >
              <option value="sql_rewrite">Переписать SQL</option>
              <option value="semantic_mapping">Семантическое сопоставление</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              Исходный запрос (NL)
            </label>
            <textarea
              value={originalQuery}
              onChange={(e) => setOriginalQuery(e.target.value)}
              rows={2}
              required
              placeholder="Например: выручка по городам за неделю"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              Сгенерированный SQL
            </label>
            <textarea
              value={generatedSql}
              onChange={(e) => setGeneratedSql(e.target.value)}
              rows={3}
              required
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
              Исправленный SQL
            </label>
            <textarea
              value={correctedSql}
              onChange={(e) => setCorrectedSql(e.target.value)}
              rows={3}
              required
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 font-mono text-xs"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                Сем. термины «до» (через запятую)
              </label>
              <input
                value={semanticBefore}
                onChange={(e) => setSemanticBefore(e.target.value)}
                placeholder="revenue, city"
                className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                Сем. термины «после» (через запятую)
              </label>
              <input
                value={semanticAfter}
                onChange={(e) => setSemanticAfter(e.target.value)}
                className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Заметка</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Необязательно"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!canCreate || createMutation.isPending}
              className="interactive-focus rounded-control border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-50"
            >
              {createMutation.isPending ? "Сохранение…" : "Сохранить исправление"}
            </button>
            <button
              type="button"
              onClick={resetCreateForm}
              className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted"
            >
              Очистить форму
            </button>
          </div>
        </form>
      )}
    </SectionCard>

    <SectionCard
      title="Очередь проверки исправлений"
      description="Подтверждайте или отклоняйте learned SQL-исправления перед публикацией."
      action={
        <span className="rounded-full border border-border-subtle bg-surface-muted px-2 py-0.5 text-[11px] font-semibold text-foreground-secondary">
          В ожидании: {pendingCount}
        </span>
      }
    >
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
    </div>
  );
}
