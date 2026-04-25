"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { useCommitCsvImport, usePreviewCsvUpload } from "@/hooks/api/use-data-upload";
import { useWorkspaceId } from "@/hooks/use-workspace-id";
import type { DataUploadPreviewDto } from "@/types/api/data-upload";

type Phase = "idle" | "preview" | "success";

export function DataUploadClient() {
  const workspaceQuery = useWorkspaceId();
  const previewUpload = usePreviewCsvUpload();
  const commitImport = useCommitCsvImport();
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<DataUploadPreviewDto | null>(null);
  const [importResult, setImportResult] = useState<{
    tableName?: string;
    rowCount?: number;
  } | null>(null);

  const importing = previewUpload.isPending || commitImport.isPending;

  const onFile = useCallback(async (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrorMessage("Выберите файл .csv.");
      setPhase("idle");
      setFileName(null);
      return;
    }
    const wid = workspaceQuery.data;
    if (!wid) {
      setErrorMessage("Не удалось определить доступ к данным. Войдите в систему и повторите.");
      return;
    }
    setErrorMessage(null);
    setFileName(file.name);
    try {
      const data = await previewUpload.mutateAsync({ file, workspaceId: wid });
      setPreview(data);
      setPhase("preview");
    } catch {
      setErrorMessage("Не удалось загрузить файл в preview. Проверьте доступ и повторите.");
      setPhase("idle");
      setPreview(null);
    }
  }, [previewUpload, workspaceQuery.data]);

  const runImport = useCallback(async () => {
    if (!preview?.upload_id) return;
    setErrorMessage(null);
    try {
      const res = await commitImport.mutateAsync(preview.upload_id);
      setImportResult({ tableName: res.table_name, rowCount: res.row_count });
      setPhase("success");
    } catch {
      setErrorMessage("Импорт в staging не выполнен. Проверьте данные и повторите.");
      setPhase("preview");
    }
  }, [commitImport, preview?.upload_id]);

  const reset = () => {
    setPhase("idle");
    setFileName(null);
    setErrorMessage(null);
    setPreview(null);
    setImportResult(null);
  };

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title="Загрузка базы данных (CSV)"
        subtitle="Файл CSV: предпросмотр, inferred schema, пример строк и guardrails. Импорт в staging через API."
      />
      <DemoQuickActions
        items={[
          { label: "Сопоставление в словаре", href: "/dictionary", hint: "Связать загруженные поля с бизнес-терминами" },
          { label: "Анализ в сценарии", href: "/notebooks/ops-health", hint: "Запустить вопросы по загруженным данным" },
          { label: "История", href: "/history", hint: "Проверить запуски после импорта" }
        ]}
      />

      {errorMessage ? (
        <div
          className="rounded-card border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-bold shadow-xs"
          role="alert"
        >
          {errorMessage}
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="interactive-focus ml-3 rounded-control px-1 font-semibold underline"
          >
            Закрыть
          </button>
        </div>
      ) : null}

      {phase === "success" ? (
        <div className="surface-decision border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-900">
          <p className="font-semibold">Импорт завершен</p>
          <p className="mt-1 text-emerald-800">
            {fileName} импортирован в staging.
            {importResult?.tableName ? ` Таблица: ${importResult.tableName}.` : ""}
            {typeof importResult?.rowCount === "number" ? ` Строк: ${importResult.rowCount}.` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reset}
              className="interactive-focus rounded-control border border-emerald-300 bg-surface-card px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-white"
            >
              Загрузить еще
            </button>
            <Link
              href={"/dictionary" as Route}
              className="interactive-focus rounded-control border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Сопоставить в словаре
            </Link>
            <Link
              href={"/notebooks/ops-health" as Route}
              className="interactive-focus rounded-control border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              Открыть сценарий
            </Link>
          </div>
        </div>
      ) : null}

      {phase !== "success" ? (
        <SectionCard
          title="CSV-файл"
          description="Выберите CSV-файл — сначала preview, затем импорт."
        >
          <label
            className={`surface-content flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-12 transition ${
              importing
                ? "border-brand-300 bg-brand-50/40"
                : "border-border-subtle bg-surface-muted/30 hover:border-brand-200 hover:bg-brand-50/20"
            }`}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={importing}
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            <span className="text-sm font-semibold text-foreground">
              {importing ? "Импорт…" : "Выберите CSV или нажмите для выбора файла"}
            </span>
            <span className="mt-1 text-xs text-foreground-muted">До 50 МБ · live API</span>
          </label>
          {importing ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-foreground-secondary">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              Выполняем запрос к backend…
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {phase === "preview" && fileName && preview ? (
        <>
          <SectionCard title="Определенная схема" description={`Файл: ${fileName}`}>
            <div className="space-y-2 sm:hidden">
              {preview.inferred_schema.map((col) => (
                <article key={col.name} className="rounded-control border border-border-subtle bg-surface-page px-3 py-2.5 shadow-xs">
                  <p className="font-mono text-xs text-foreground">{col.name}</p>
                  <p className="mt-1 text-xs text-foreground-secondary">
                    Тип: {col.type} · Nullable: {col.nullable ? "Да" : "Нет"}
                  </p>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full border-collapse text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] font-semibold uppercase text-foreground-muted">
                    <th className="pb-2 pr-4">Колонка</th>
                    <th className="pb-2 pr-4">Тип</th>
                    <th className="pb-2">Nullable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {preview.inferred_schema.map((col) => (
                    <tr key={col.name}>
                      <td className="py-2 pr-4 font-mono text-xs">{col.name}</td>
                      <td className="py-2 pr-4 text-foreground-secondary">{col.type}</td>
                      <td className="py-2 text-foreground-secondary">{col.nullable ? "Да" : "Нет"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Sample rows" description="Первые строки после приведения типов.">
            <div className="space-y-2 sm:hidden">
              {preview.sample_rows.map((row, i) => (
                <article key={i} className="rounded-control border border-border-subtle bg-surface-page px-3 py-2.5 shadow-xs">
                  <dl className="space-y-1.5">
                    {Object.keys(row).map((k) => (
                      <div key={k} className="grid grid-cols-[110px_1fr] gap-2 text-xs">
                        <dt className="truncate font-semibold text-foreground-secondary">{k}</dt>
                        <dd className="truncate text-foreground">{row[k]}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[480px] border-collapse text-left font-mono text-[11px]">
                <thead>
                  <tr className="border-b border-border-subtle text-foreground-muted">
                    {Object.keys(preview.sample_rows[0] ?? {}).map((k) => (
                      <th key={k} className="pb-2 pr-3 font-semibold">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-foreground">
                  {preview.sample_rows.map((row, i) => (
                    <tr key={i}>
                      {Object.keys(row).map((k) => (
                        <td key={k} className="py-2 pr-3">
                          {row[k]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Предупреждения импорта">
            <ul className="list-inside list-disc space-y-1 text-sm text-amber-900">
              {(preview.warnings.length ? preview.warnings : ["Предупреждений не обнаружено."]).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => void runImport()}
                disabled={importing}
                className="interactive-focus micro-lift rounded-control bg-brand-500 px-4 py-2 text-sm font-semibold text-black shadow-xs hover:bg-brand-400 active:translate-y-0"
              >
                {importing ? "Импорт..." : "Импортировать"}
              </button>
              <button
                type="button"
                onClick={reset}
                className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-4 py-2 text-sm font-semibold text-foreground-secondary hover:bg-surface-muted"
              >
                Отмена
              </button>
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
