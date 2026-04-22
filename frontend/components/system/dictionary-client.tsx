"use client";

import { useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import type { DictionaryRow } from "@/lib/system/mock-data";
import { MOCK_DICTIONARY } from "@/lib/system/mock-data";
import type { UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["admin", "manager", "marketer", "executive"];
const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  marketer: "Маркетолог",
  executive: "Руководитель"
};

function emptyForm(): Omit<DictionaryRow, "id"> {
  return { term: "", synonyms: [], sqlExpression: "", visibility: ["manager"] };
}

export function DictionaryClient() {
  const [rows, setRows] = useState<DictionaryRow[]>(MOCK_DICTIONARY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [synonymsStr, setSynonymsStr] = useState("");
  const [sqlExpression, setSqlExpression] = useState("");
  const [visibility, setVisibility] = useState<UserRole[]>(["manager"]);

  const formTitle = creating ? "Создать термин" : editingId ? "Редактировать термин" : null;

  const resetForm = () => {
    setCreating(false);
    setEditingId(null);
    setFormError(null);
    setFormMsg(null);
    const e = emptyForm();
    setTerm(e.term);
    setSynonymsStr("");
    setSqlExpression(e.sqlExpression);
    setVisibility(e.visibility);
  };

  const loadRow = (row: DictionaryRow) => {
    setEditingId(row.id);
    setCreating(false);
    setTerm(row.term);
    setSynonymsStr(row.synonyms.join(", "));
    setSqlExpression(row.sqlExpression);
    setVisibility(row.visibility);
  };

  const parseSynonyms = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const toggleRole = (r: UserRole) => {
    setVisibility((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  };

  const save = () => {
    setFormError(null);
    setFormMsg(null);
    if (!term.trim() || !sqlExpression.trim()) {
      setFormError("Термин и SQL-выражение обязательны.");
      return;
    }
    const syn = parseSynonyms(synonymsStr);
    if (visibility.length === 0) {
      setFormError("Выберите хотя бы одну роль видимости.");
      return;
    }
    if (creating) {
      const id = `d-${Date.now()}`;
      setRows((prev) => [...prev, { id, term: term.trim(), synonyms: syn, sqlExpression: sqlExpression.trim(), visibility }]);
      setFormMsg(`Термин "${term.trim()}" создан.`);
    } else if (editingId) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === editingId
            ? { ...r, term: term.trim(), synonyms: syn, sqlExpression: sqlExpression.trim(), visibility }
            : r
        )
      );
      setFormMsg(`Термин "${term.trim()}" обновлен.`);
    }
    setCreating(false);
    setEditingId(null);
    setTerm("");
    setSynonymsStr("");
    setSqlExpression("");
    setVisibility(["manager"]);
  };

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title="Бизнес-словарь"
        subtitle="Канонические термины, синонимы, SQL-фрагменты и ролевая видимость в сценариях."
      />
      <DemoQuickActions
        items={[
          { label: "Открыть сценарий", href: "/notebooks/ops-health", hint: "Посмотреть применение терминов в парсинге промпта" },
          { label: "Шаблоны", href: "/templates", hint: "Workflow шаблоны + словарь" },
          { label: "Загрузка данных", href: "/data-upload", hint: "После ingest сопоставьте новые поля здесь" }
        ]}
      />
      {formMsg ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          {formMsg}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => {
            resetForm();
            setCreating(true);
          }}
          className="interactive-focus micro-lift rounded-control bg-brand-500 px-3 py-2 text-xs font-semibold text-black shadow-xs hover:bg-brand-400 active:translate-y-0"
        >
          Новый термин
        </button>
        {(creating || editingId) && (
          <button
            type="button"
            onClick={resetForm}
            className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-3 py-2 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted"
          >
            Отмена
          </button>
        )}
      </div>

      {(creating || editingId) && (
        <SectionCard title={formTitle!} description="Mock-форма - сохраняется только в состоянии сессии.">
          {formError ? (
            <div className="mb-3 rounded-control border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
              {formError}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase text-foreground-muted">Бизнес-термин</label>
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm focus:border-brand-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase text-foreground-muted">Синонимы (через запятую)</label>
              <input
                value={synonymsStr}
                onChange={(e) => setSynonymsStr(e.target.value)}
                placeholder="NR, net sales"
                className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm focus:border-brand-400"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold uppercase text-foreground-muted">SQL-выражение</label>
              <textarea
                value={sqlExpression}
                onChange={(e) => setSqlExpression(e.target.value)}
                rows={3}
                className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 font-mono text-xs focus:border-brand-400"
              />
            </div>
            <div className="sm:col-span-2">
              <p className="text-[11px] font-semibold uppercase text-foreground-muted">Видимость по ролям</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={visibility.includes(r)}
                      onChange={() => toggleRole(r)}
                      className="rounded border-border-subtle text-brand-600 focus:ring-brand-500"
                    />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={save}
            className="interactive-focus micro-lift mt-4 rounded-control bg-brand-500 px-4 py-2 text-sm font-semibold text-black hover:bg-brand-400 active:translate-y-0"
          >
            {creating ? "Создать" : "Сохранить изменения"}
          </button>
        </SectionCard>
      )}

      <SectionCard title="Термины" description="Нажмите строку для редактирования.">
        {filtered.length === 0 ? (
          <div className="rounded-control border border-dashed border-border-subtle bg-surface-page px-4 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">Пока нет терминов в словаре</p>
            <p className="mt-1 text-sm text-foreground-secondary">Создайте термин, чтобы включить семантическое сопоставление в сценариях.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {filtered.map((row) => (
                <article
                  key={row.id}
                  onClick={() => loadRow(row)}
                  className="cursor-pointer rounded-control border border-border-subtle bg-surface-page px-3 py-3 shadow-xs transition hover:border-brand-200 hover:bg-brand-50/40"
                >
                  <p className="text-sm font-semibold text-foreground">{row.term}</p>
                  <p className="mt-1 text-xs text-foreground-secondary">{row.synonyms.join(" · ") || "—"}</p>
                  <p className="mt-2 rounded-control bg-surface-muted px-2 py-1 font-mono text-[11px] text-foreground-secondary">
                    {row.sqlExpression}
                  </p>
                  <p className="mt-2 text-xs text-foreground-muted">Видимость: {row.visibility.join(", ")}</p>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] border-collapse text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                    <th className="pb-2 pr-4">Термин</th>
                    <th className="pb-2 pr-4">Синонимы</th>
                    <th className="pb-2 pr-4">SQL</th>
                    <th className="pb-2">Видимость</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => loadRow(row)}
                      className="cursor-pointer hover:bg-brand-50/50"
                    >
                      <td className="py-3 pr-4 font-medium text-foreground">{row.term}</td>
                      <td className="py-3 pr-4 text-xs text-foreground-secondary">{row.synonyms.join(" · ")}</td>
                      <td className="py-3 pr-4 font-mono text-[11px] text-foreground-secondary">{row.sqlExpression}</td>
                      <td className="py-3 text-xs text-foreground-secondary">{row.visibility.join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>
    </div>
  );
}
