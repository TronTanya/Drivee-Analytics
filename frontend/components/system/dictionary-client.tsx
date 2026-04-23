"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { fetchDictionaryEntries } from "@/lib/api/dictionary";
import type { DictionaryRow } from "@/lib/system/mock-data";
import type { DictionaryEntryDto } from "@/types/api/dictionary";
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await fetchDictionaryEntries();
        if (!cancelled) {
          setRows(data.map(dtoToRow));
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Не удалось загрузить словарь");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const readOnlySemantic = useMemo(
    () => rows.length > 0 && rows.some((r) => Boolean(r.canonicalMetricKey)),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return rows;
    }
    return rows.filter((r) => rowSearchBlob(r).includes(q));
  }, [rows, search]);

  const selected = useMemo(
    () => (selectedId ? rows.find((r) => r.id === selectedId) ?? null : null),
    [rows, selectedId]
  );

  return (
    <div className="space-y-6">
      <SystemPageIntro
        title="Семантический словарь"
        subtitle="Канонические метрики, синонимы и SQL-фрагменты: как NL→SQL сопоставляет запрос с источником anonymized_incity_orders."
      />
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

      {readOnlySemantic ? (
        <div className="rounded-card border border-border-subtle bg-surface-card px-4 py-3 text-sm text-foreground-secondary">
          Словарь задаётся на сервере (файл <span className="font-mono text-xs">app/data/semantic_dictionary.json</span>
          ). Редактирование через API в MVP отключено.
        </div>
      ) : null}

      <SectionCard title="Поиск" description="Фильтр по бизнес-термину, синониму или каноническому ключу.">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Например: отмены, средний чек, done_rides…"
          className="interactive-focus w-full rounded-control border border-border-subtle px-3 py-2 text-sm focus:border-brand-400"
        />
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
