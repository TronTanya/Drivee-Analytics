"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import {
  bootstrapDictionaryFromTrain,
  createDictionaryEntry,
  deleteDictionaryEntry,
  fetchDictionaryEntries,
  fetchDictionaryMeta,
  updateDictionaryEntry
} from "@/lib/api/dictionary";
import type { DictionaryRow } from "@/lib/system/mock-data";
import type { DictionaryEntryDto, UpsertDictionaryEntryDto } from "@/types/api/dictionary";
import type { UserRole } from "@/lib/types";

const DOMAIN_LABEL: Record<string, string> = {
  orders_rides: "Поездки и заказы",
  cancellations_revenue: "Отмены, конверсия и выручка"
};

function dtoToRow(e: DictionaryEntryDto): DictionaryRow {
  return {
    id: e.id,
    term: e.term,
    synonyms: e.synonyms ?? [],
    sqlExpression: e.sql_expression,
    visibility: (e.visibility_roles ?? []) as UserRole[],
    domain: e.domain,
    canonicalMetricKey: e.canonical_metric_key,
    sourceTable: e.source_table,
    sourceColumn: e.source_column ?? undefined,
    aggregationType: e.aggregation_type,
    termType: e.term_type,
    targetField: e.target_field ?? undefined,
    filterValue: e.filter_value ?? undefined,
    descriptionRu: e.description_ru,
    constraints: e.constraints,
    exampleQueries: e.example_queries,
    systemInterpretationRu: e.system_interpretation_ru
  };
}

function rowSearchBlob(r: DictionaryRow): string {
  return [r.term, r.canonicalMetricKey ?? "", r.domain ?? "", ...(r.synonyms ?? []), r.sqlExpression].join(" ").toLowerCase();
}

export function DictionaryClient() {
  const [rows, setRows] = useState<DictionaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<"all" | "custom_train">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [synonymsText, setSynonymsText] = useState("");
  const [sqlExpression, setSqlExpression] = useState("");
  const [domain, setDomain] = useState("custom_train");
  const [canonicalMetricKey, setCanonicalMetricKey] = useState("");
  const [sourceColumn, setSourceColumn] = useState("");
  const [aggregationType, setAggregationType] = useState("custom");
  const [exampleQueriesText, setExampleQueriesText] = useState("");
  const [interpretationRu, setInterpretationRu] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [dictionaryVersion, setDictionaryVersion] = useState<string>("");
  const [termType, setTermType] = useState("metric");
  const [targetField, setTargetField] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [descriptionRu, setDescriptionRu] = useState("");

  const loadEntries = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchDictionaryEntries();
      setRows(data.map(dtoToRow));
      const meta = await fetchDictionaryMeta();
      setDictionaryVersion(meta.version);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не удалось загрузить словарь");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const filtered = useMemo(() => {
    const scoped = scope === "custom_train" ? rows.filter((r) => (r.domain ?? "") === "custom_train") : rows;
    const q = search.trim().toLowerCase();
    if (!q) {
      return scoped;
    }
    return scoped.filter((r) => rowSearchBlob(r).includes(q));
  }, [rows, scope, search]);

  const selected = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId]
  );

  useEffect(() => {
    if (!selected) return;
    setMode("edit");
    setTerm(selected.term);
    setSynonymsText((selected.synonyms ?? []).join(", "));
    setSqlExpression(selected.sqlExpression);
    setDomain(selected.domain ?? "custom_train");
    setCanonicalMetricKey(selected.canonicalMetricKey ?? "");
    setSourceColumn(selected.sourceColumn ?? "");
    setAggregationType(selected.aggregationType ?? "custom");
    setTermType(selected.termType ?? "metric");
    setTargetField(selected.targetField ?? "");
    setFilterValue(selected.filterValue ?? "");
    setDescriptionRu(selected.descriptionRu ?? "");
    setExampleQueriesText((selected.exampleQueries ?? []).join("\n"));
    setInterpretationRu(selected.systemInterpretationRu ?? "");
  }, [selected]);

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title="Семантический словарь"
        subtitle="Канонические метрики, синонимы и SQL-фрагменты: как NL→SQL сопоставляет запрос с источником public.train."
      />
      {dictionaryVersion ? (
        <p className="text-xs text-foreground-muted">Версия словаря: {dictionaryVersion}</p>
      ) : null}
      <DemoQuickActions
        items={[
          {
            label: "Открыть сценарий",
            href: "/notebooks/ops-health",
            hint: "Промпт проходит через semantic parse → resolve_semantic_terms → SQL"
          },
          { label: "Шаблоны", href: "/templates", hint: "Workflow шаблоны + словарь" },
          { label: "Загрузка данных", href: "/data-upload", hint: "После ingest проверьте соответствие полей словарю" }
        ]}
      />

      {loadError ? (
        <div className="rounded-card border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">{loadError}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setLoadError(null);
            setSaving(true);
            try {
              const res = await bootstrapDictionaryFromTrain();
              await loadEntries();
              setSelectedId(null);
              setMode("create");
              setTerm("");
              setSynonymsText("");
              setSqlExpression("");
              setDomain("custom_train");
              setCanonicalMetricKey("");
              setSourceColumn("");
              setAggregationType("custom");
              setExampleQueriesText("");
              setInterpretationRu("");
              setLoadError(`Добавлено терминов из train: ${res.added}. Всего: ${res.total}.`);
            } catch (e) {
              setLoadError(e instanceof Error ? e.message : "Не удалось синхронизировать словарь с train.");
            } finally {
              setSaving(false);
            }
          }}
          className="rounded-control border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-50"
        >
          {saving ? "Обновление..." : "Синхронизировать из train"}
        </button>
      </div>

      <SectionCard
        title={mode === "edit" ? "Редактирование термина" : "Добавить термин"}
        description="Можно добавлять, редактировать и удалять записи словаря."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Термин</label>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Например: Выручка по тендерам"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Синонимы</label>
            <input
              value={synonymsText}
              onChange={(e) => setSynonymsText(e.target.value)}
              placeholder="Через запятую: revenue, выручка, сумма"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">SQL выражение</label>
            <textarea
              value={sqlExpression}
              onChange={(e) => setSqlExpression(e.target.value)}
              rows={3}
              placeholder="Например: SUM(a.price_tender_local)"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Домен</label>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="orders_rides / cancellations_revenue / custom_train"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Canonical key</label>
            <input
              value={canonicalMetricKey}
              onChange={(e) => setCanonicalMetricKey(e.target.value)}
              placeholder="Например: avg_price_tender_local"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Source column</label>
            <input
              value={sourceColumn}
              onChange={(e) => setSourceColumn(e.target.value)}
              placeholder="Например: price_tender_local"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Aggregation</label>
            <input
              value={aggregationType}
              onChange={(e) => setAggregationType(e.target.value)}
              placeholder="sum / avg / count / ratio / custom"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Term type</label>
            <select
              value={termType}
              onChange={(e) => setTermType(e.target.value)}
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            >
              <option value="metric">metric</option>
              <option value="dimension">dimension</option>
              <option value="filter">filter</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Target field</label>
            <input
              value={targetField}
              onChange={(e) => setTargetField(e.target.value)}
              placeholder="city_id / order_channel / time_period"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Filter value</label>
            <input
              value={filterValue}
              onChange={(e) => setFilterValue(e.target.value)}
              placeholder="previous_week"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Описание (RU)</label>
            <textarea
              value={descriptionRu}
              onChange={(e) => setDescriptionRu(e.target.value)}
              rows={2}
              placeholder="Человекочитаемое описание бизнес-термина"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Примеры запросов</label>
            <textarea
              value={exampleQueriesText}
              onChange={(e) => setExampleQueriesText(e.target.value)}
              rows={3}
              placeholder="Один пример на строку"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Интерпретация RU</label>
            <textarea
              value={interpretationRu}
              onChange={(e) => setInterpretationRu(e.target.value)}
              rows={2}
              placeholder="Короткое пояснение для trace/UI"
              className="interactive-focus mt-1 w-full rounded-control border border-border-subtle px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                const t = term.trim();
                const sql = sqlExpression.trim();
                if (!t || !sql) {
                  setLoadError("Заполните термин и SQL выражение.");
                  return;
                }
                setLoadError(null);
                setSaving(true);
                const synonyms = synonymsText
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean);
                const exampleQueries = exampleQueriesText
                  .split("\n")
                  .map((x) => x.trim())
                  .filter(Boolean);
                const visibilityRoles: UserRole[] = ["admin", "manager", "marketer", "executive"];
                const payload: UpsertDictionaryEntryDto = {
                  term: t,
                  synonyms,
                  sql_expression: sql,
                  visibility_roles: visibilityRoles,
                  domain: domain.trim() || "custom_train",
                  canonical_metric_key: canonicalMetricKey.trim() || undefined,
                  source_table: "train",
                  source_column: sourceColumn.trim() || null,
                  aggregation_type: aggregationType.trim() || "custom",
                  term_type: termType.trim() || "metric",
                  target_field: targetField.trim() || null,
                  filter_value: filterValue.trim() || null,
                  description_ru: descriptionRu.trim() || undefined,
                  example_queries: exampleQueries,
                  system_interpretation_ru: interpretationRu.trim() || undefined
                };
                try {
                  if (mode === "edit" && selectedId) {
                    await updateDictionaryEntry(selectedId, payload);
                  } else {
                    await createDictionaryEntry(payload);
                  }
                  await loadEntries();
                  setMode("create");
                  setSelectedId(null);
                  setTerm("");
                  setSynonymsText("");
                  setSqlExpression("");
                  setDomain("custom_train");
                  setCanonicalMetricKey("");
                  setSourceColumn("");
                  setAggregationType("custom");
                  setTermType("metric");
                  setTargetField("");
                  setFilterValue("");
                  setDescriptionRu("");
                  setExampleQueriesText("");
                  setInterpretationRu("");
                } catch (e) {
                  setLoadError(e instanceof Error ? e.message : "Не удалось сохранить термин.");
                } finally {
                  setSaving(false);
                }
              }}
              className="rounded-control border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-900 hover:bg-brand-100 disabled:opacity-50"
            >
              {saving ? "Сохранение..." : mode === "edit" ? "Сохранить изменения" : "Добавить термин"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("create");
                setSelectedId(null);
                setTerm("");
                setSynonymsText("");
                setSqlExpression("");
                setDomain("custom_train");
                setCanonicalMetricKey("");
                setSourceColumn("");
                setAggregationType("custom");
                setExampleQueriesText("");
                setInterpretationRu("");
              }}
              className="rounded-control border border-border-subtle bg-surface-card px-3 py-1.5 text-xs font-semibold text-foreground-secondary hover:bg-surface-muted"
            >
              Новый
            </button>
            <button
              type="button"
              disabled={!selectedId || deleting}
              onClick={async () => {
                if (!selectedId) return;
                setDeleting(true);
                setLoadError(null);
                try {
                  await deleteDictionaryEntry(selectedId);
                  await loadEntries();
                  setMode("create");
                  setSelectedId(null);
                  setTerm("");
                  setSynonymsText("");
                  setSqlExpression("");
                  setDomain("custom_train");
                  setCanonicalMetricKey("");
                  setSourceColumn("");
                  setAggregationType("custom");
                  setExampleQueriesText("");
                  setInterpretationRu("");
                } catch (e) {
                  setLoadError(e instanceof Error ? e.message : "Не удалось удалить термин.");
                } finally {
                  setDeleting(false);
                }
              }}
              className="rounded-control border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
            >
              {deleting ? "Удаление..." : "Удалить выбранный"}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Поиск" description="Фильтр по бизнес-термину, синониму или каноническому ключу.">
        <div className="space-y-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Например: отмены, средний чек, done_rides…"
            className="interactive-focus w-full rounded-control border border-border-subtle px-3 py-2 text-sm focus:border-brand-400"
          />
          <div className="flex rounded-control border border-border-subtle bg-surface-muted p-0.5 w-fit">
            <button
              type="button"
              aria-pressed={scope === "all"}
              onClick={() => setScope("all")}
              className={`rounded-[6px] px-2.5 py-1 text-xs font-semibold ${
                scope === "all" ? "bg-surface-card text-brand-800 shadow-xs" : "text-foreground-secondary"
              }`}
            >
              Все термины
            </button>
            <button
              type="button"
              aria-pressed={scope === "custom_train"}
              onClick={() => setScope("custom_train")}
              className={`rounded-[6px] px-2.5 py-1 text-xs font-semibold ${
                scope === "custom_train" ? "bg-surface-card text-brand-800 shadow-xs" : "text-foreground-secondary"
              }`}
            >
              Только custom_train
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Термины"
        description={loading ? "Загрузка…" : `Всего записей: ${filtered.length}${search.trim() ? ` (из ${rows.length})` : ""}`}
      >
        {loading ? (
          <p className="text-sm text-foreground-secondary">Загрузка словаря…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-control border border-dashed border-border-subtle bg-surface-page px-4 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">Ничего не найдено</p>
            <p className="mt-1 text-sm text-foreground-secondary">Измените строку поиска или сбросьте фильтр.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2 md:hidden">
              {filtered.map((row) => (
                <article
                  key={row.id}
                  onClick={() => setSelectedId(row.id === selectedId ? null : row.id)}
                  className={`cursor-pointer rounded-control border px-3 py-3 shadow-xs transition hover:border-brand-200 hover:bg-brand-50/40 ${
                    selectedId === row.id ? "border-brand-400 bg-brand-50/50" : "border-border-subtle bg-surface-page"
                  }`}
                >
                  <p className="text-sm font-semibold text-foreground">{row.term}</p>
                  {row.canonicalMetricKey ? (
                    <p className="mt-1 font-mono text-[11px] text-foreground-muted">{row.canonicalMetricKey}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-foreground-secondary">{row.synonyms.join(" · ") || "—"}</p>
                </article>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[840px] border-collapse text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
                    <th className="pb-2 pr-4">Термин</th>
                    <th className="pb-2 pr-4">Канон. метрика</th>
                    <th className="pb-2 pr-4">Домен</th>
                    <th className="pb-2 pr-4">Синонимы</th>
                    <th className="pb-2">SQL-фрагмент</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {filtered.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedId(row.id === selectedId ? null : row.id)}
                      className={`cursor-pointer hover:bg-brand-50/50 ${selectedId === row.id ? "bg-brand-50/60" : ""}`}
                    >
                      <td className="py-3 pr-4 font-medium text-foreground">{row.term}</td>
                      <td className="py-3 pr-4 font-mono text-[11px] text-foreground-secondary">{row.canonicalMetricKey ?? "—"}</td>
                      <td className="py-3 pr-4 text-xs text-foreground-secondary">
                        {row.domain ? (DOMAIN_LABEL[row.domain] ?? row.domain) : "—"}
                      </td>
                      <td className="py-3 pr-4 text-xs text-foreground-secondary">{row.synonyms.join(" · ") || "—"}</td>
                      <td className="max-w-[320px] truncate py-3 font-mono text-[11px] text-foreground-secondary" title={row.sqlExpression}>
                        {row.sqlExpression}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SectionCard>

      {selected ? (
        <SectionCard
          title="Как система понимает термин"
          description={`Канонический ключ: ${selected.canonicalMetricKey ?? selected.id}`}
        >
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-[11px] font-semibold uppercase text-foreground-muted">Интерпретация</p>
              <p className="mt-1 text-foreground-secondary">
                {selected.systemInterpretationRu ?? "Описание недоступно для этой записи."}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase text-foreground-muted">Таблица</p>
                <p className="mt-1 font-mono text-xs text-foreground">{selected.sourceTable ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-foreground-muted">Колонка</p>
                <p className="mt-1 font-mono text-xs text-foreground">{selected.sourceColumn ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-foreground-muted">Агрегация</p>
                <p className="mt-1 text-foreground-secondary">{selected.aggregationType ?? "—"}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase text-foreground-muted">Видимость ролей</p>
                <p className="mt-1 text-xs text-foreground-secondary">{selected.visibility.join(", ") || "—"}</p>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-foreground-muted">Ограничения (constraints)</p>
              <pre className="mt-2 max-h-48 overflow-auto rounded-control bg-surface-muted p-3 font-mono text-[11px] text-foreground-secondary">
                {JSON.stringify(selected.constraints ?? {}, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-foreground-muted">Примеры запросов</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-foreground-secondary">
                {(selected.exampleQueries ?? []).length ? (
                  selected.exampleQueries!.map((q) => <li key={q}>{q}</li>)
                ) : (
                  <li>Нет примеров в словаре.</li>
                )}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase text-foreground-muted">SQL-выражение (фрагмент SELECT)</p>
              <pre className="mt-2 overflow-x-auto rounded-control bg-surface-muted p-3 font-mono text-[11px] text-foreground-secondary">
                {selected.sqlExpression}
              </pre>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
