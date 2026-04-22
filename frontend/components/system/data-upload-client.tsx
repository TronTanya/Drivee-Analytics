"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { isDemoModeEnabled } from "@/lib/api";
import { MOCK_INFERRED_SCHEMA, MOCK_SAMPLE_ROWS } from "@/lib/system/mock-data";

type Phase = "idle" | "preview" | "importing" | "success";

const MOCK_WARNINGS = [
  "Колонка amount_usd: в 12 строках пустые значения - приведены к NULL.",
  "Первичный ключ не обнаружен; импорт использует синтетический row_id."
];

export function DataUploadClient() {
  const demoMode = isDemoModeEnabled();
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrorMessage("Выберите файл .csv (mock-валидатор).");
      setPhase("idle");
      setFileName(null);
      return;
    }
    setErrorMessage(null);
    setFileName(file.name);
    setPhase("preview");
  }, []);

  const runImport = useCallback(() => {
    setPhase("importing");
    setErrorMessage(null);
    setTimeout(() => {
      const ok = demoMode ? true : Math.random() > 0.15;
      if (ok) {
        setPhase("success");
      } else {
        setPhase("preview");
        setErrorMessage("Хранилище отклонило загрузку: staging-таблица заблокирована (mock). Повторите импорт.");
      }
    }, 1400);
  }, [demoMode]);

  const reset = () => {
    setPhase("idle");
    setFileName(null);
    setErrorMessage(null);
  };

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title="Загрузка данных"
        subtitle="Загрузка CSV с inferred schema, sample rows и предупреждениями guardrails. Импорт симулирован."
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
            {fileName} загружен в staging workspace. Проверено sample rows: {MOCK_SAMPLE_ROWS.length} (mock).
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

      {phase !== "success" && (
        <SectionCard
          title="CSV-файл"
          description="Drag-and-drop оформление и стандартный file picker для доступности."
        >
          <label
            className={`surface-content flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-12 transition ${
              phase === "importing"
                ? "border-brand-300 bg-brand-50/40"
                : "border-border-subtle bg-surface-muted/30 hover:border-brand-200 hover:bg-brand-50/20"
            }`}
          >
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={phase === "importing"}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
            <span className="text-sm font-semibold text-foreground">
              {phase === "importing" ? "Импорт…" : "Выберите CSV или нажмите для выбора файла"}
            </span>
            <span className="mt-1 text-xs text-foreground-muted">До 50 МБ · только mock-клиент</span>
          </label>
          {phase === "importing" ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-foreground-secondary">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
              Запись в staging-таблицу…
            </div>
          ) : null}
        </SectionCard>
      )}

      {phase === "preview" && fileName ? (
        <>
          <SectionCard title="Определенная схема" description={`Файл: ${fileName}`}>
            <div className="space-y-2 sm:hidden">
              {MOCK_INFERRED_SCHEMA.map((col) => (
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
                  {MOCK_INFERRED_SCHEMA.map((col) => (
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

          <SectionCard title="Sample rows" description="Первые строки после приведения типов (mock).">
            <div className="space-y-2 sm:hidden">
              {MOCK_SAMPLE_ROWS.map((row, i) => (
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
                    {Object.keys(MOCK_SAMPLE_ROWS[0] ?? {}).map((k) => (
                      <th key={k} className="pb-2 pr-3 font-semibold">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle text-foreground">
                  {MOCK_SAMPLE_ROWS.map((row, i) => (
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
              {MOCK_WARNINGS.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={runImport}
                className="interactive-focus micro-lift rounded-control bg-brand-500 px-4 py-2 text-sm font-semibold text-black shadow-xs hover:bg-brand-400 active:translate-y-0"
              >
                Импортировать в workspace
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
