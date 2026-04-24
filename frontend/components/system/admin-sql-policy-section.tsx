"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { fetchAdminSqlPolicy, putAdminSqlPolicy } from "@/lib/api/admin-sql-policy";
import type { AdminSqlPolicyDto } from "@/types/api/admin-sql-policy";

const INPUT_CLASS =
  "w-full rounded-control border border-border-subtle bg-surface-card px-3 py-2.5 text-sm text-foreground shadow-xs placeholder:text-foreground-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25";

function linesToList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function AdminSqlPolicySection() {
  const [data, setData] = useState<AdminSqlPolicyDto | null>(null);
  const [tablesText, setTablesText] = useState("");
  const [colsText, setColsText] = useState("");
  const [rowCap, setRowCap] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hydrate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fetchAdminSqlPolicy();
      setData(d);
      setTablesText(d.extra_whitelist_tables.join("\n"));
      setColsText(d.extra_whitelist_columns.join("\n"));
      setRowCap(d.nl_max_result_rows != null ? String(d.nl_max_result_rows) : "");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось загрузить политику SQL");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const capRaw = rowCap.trim();
      const d = await putAdminSqlPolicy({
        extra_whitelist_tables: linesToList(tablesText),
        extra_whitelist_columns: linesToList(colsText),
        nl_max_result_rows: capRaw === "" ? null : Number.parseInt(capRaw, 10)
      });
      setData(d);
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="admin-sql-policy" className="rounded-card border border-border-subtle bg-surface-card p-5 shadow-xs">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Администрирование SQL</p>
      <h2 className="mt-1 text-lg font-semibold text-foreground">Таблицы и ограничения (whitelist)</h2>
      <p className="mt-2 text-sm text-foreground-secondary">
        Дополнительные имена таблиц и колонок объединяются с серверным env-конфигом. Лимит строк ужимает верхнюю границу
        LIMIT для NL→SQL (не больше значений в конфиге сервера).
      </p>

      {loading ? <p className="mt-4 text-sm text-foreground-muted">Загрузка…</p> : null}
      {error ? <div className="mt-4 rounded-control border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{error}</div> : null}

      {!loading && data ? (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-foreground-secondary">Доп. таблицы (по одной в строке)</label>
              <textarea
                className={`${INPUT_CLASS} mt-1 min-h-[120px] font-mono text-xs`}
                value={tablesText}
                onChange={(e) => {
                  setSaved(false);
                  setTablesText(e.target.value);
                }}
                placeholder="my_analytics_table"
                disabled={saving}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground-secondary">Доп. колонки (по одной в строке)</label>
              <textarea
                className={`${INPUT_CLASS} mt-1 min-h-[120px] font-mono text-xs`}
                value={colsText}
                onChange={(e) => {
                  setSaved(false);
                  setColsText(e.target.value);
                }}
                placeholder="custom_metric_col"
                disabled={saving}
              />
            </div>
          </div>
          <div className="mt-4 max-w-xs">
            <label className="text-xs font-semibold text-foreground-secondary">Лимит строк (пусто = только env)</label>
            <input
              type="number"
              min={1}
              className={`${INPUT_CLASS} mt-1`}
              value={rowCap}
              onChange={(e) => {
                setSaved(false);
                setRowCap(e.target.value);
              }}
              disabled={saving}
            />
          </div>
          <div className="mt-4 rounded-control border border-border-subtle bg-surface-muted/40 p-3 text-xs text-foreground-secondary">
            <p className="font-semibold text-foreground">Эффективно сейчас</p>
            <p className="mt-1">
              LIMIT до <strong>{data.effective_sql_default_limit}</strong> · таблиц:{" "}
              <span className="font-mono">{data.effective_whitelist_tables.length}</span>, колонок:{" "}
              <span className="font-mono">{data.effective_whitelist_columns.length}</span>
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="mt-4 rounded-control border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
          >
            {saving ? "Сохранение…" : "Сохранить политику SQL"}
          </button>
          {saved ? <p className="mt-2 text-sm text-emerald-800">Сохранено. Изменения применятся к новым запросам в течение нескольких секунд.</p> : null}
        </>
      ) : null}
    </section>
  );
}
