"use client";

import type { Route } from "next";
import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import { useCurrentUser } from "@/hooks/api/use-auth";
import {
  formatRolesRu,
  SEMANTIC_DICTIONARY_REFERENCE_ROWS,
  semanticKindLabelRu
} from "@/lib/semantic-dictionary-reference";

export function SemanticDictionaryView() {
  const me = useCurrentUser();
  const isAdmin = me.data?.role === "admin";

  return (
    <div className="flex min-h-0 min-w-0 flex-col">
      <SystemPageIntro
        title="Словарь бизнес-терминов"
        subtitle="Справочник semantic layer: как бизнес-формулировки сопоставляются с полями и агрегатами в SQL. Таблица носит ознакомительный характер; расширяемые записи для workspace настраиваются в разделе «Словарь» (админ)."
      />

      <div className="min-w-0 border-t border-border-subtle bg-surface-base px-4 py-5 sm:px-6">
        <div className="flex w-full min-w-0 flex-col gap-5">
          <div className="grid min-w-0 gap-5 lg:grid-cols-2 lg:items-stretch">
            <DemoQuickActions
              className="h-full"
              title="Быстрые действия"
              items={[
                { label: "Сценарии NL→SQL", href: "/scenarios", hint: "Проверить запросы end-to-end" },
                ...(isAdmin
                  ? [{ label: "Словарь (редактирование)", href: "/dictionary", hint: "API-записи словаря" }]
                  : [])
              ]}
            />

            <SectionCard
              className="h-full min-h-0"
              title="Зачем нужен semantic layer?"
              description="Коротко для аналитиков и владельцев данных"
            >
              <p className="text-sm leading-relaxed text-foreground-secondary">
                Система не отправляет вопрос напрямую в SQL. Сначала бизнес-термины сопоставляются с разрешёнными
                метриками, измерениями и фильтрами. Это повышает точность NL→SQL и снижает риск небезопасных запросов.
              </p>
            </SectionCard>
          </div>

          <SectionCard
            className="min-w-0"
            title="Таблица терминов"
            description="Бизнес-термин · SQL-поле или формула · тип · синонимы · роли · пример запроса"
          >
            <p className="mb-3 text-xs text-foreground-secondary">
              В таблице — все {SEMANTIC_DICTIONARY_REFERENCE_ROWS.length} справочных термина из этого экрана (метрики,
              измерения, фильтр). Живые записи workspace подгружаются из API в разделе «Словарь».
            </p>
            <div className="min-w-0 overflow-x-auto rounded-control border border-border-subtle">
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border-subtle bg-surface-muted/50 text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                    <th className="px-3 py-2.5 sm:px-4">Бизнес-термин</th>
                    <th className="px-3 py-2.5 sm:px-4">SQL-поле / формула</th>
                    <th className="px-3 py-2.5 sm:px-4">Тип</th>
                    <th className="px-3 py-2.5 sm:px-4">Синонимы</th>
                    <th className="px-3 py-2.5 sm:px-4">Роли</th>
                    <th className="px-3 py-2.5 sm:px-4">Пример вопроса</th>
                  </tr>
                </thead>
                <tbody>
                  {SEMANTIC_DICTIONARY_REFERENCE_ROWS.map((row) => (
                    <tr
                      key={row.term}
                      className="border-b border-border-subtle/80 last:border-0 odd:bg-surface-base even:bg-surface-muted/20"
                    >
                      <td className="min-w-0 px-3 py-2.5 font-medium text-foreground sm:px-4">{row.term}</td>
                      <td className="min-w-0 break-all px-3 py-2.5 font-mono text-xs text-foreground-secondary sm:break-normal sm:px-4">
                        {row.sqlOrFormula}
                      </td>
                      <td className="min-w-0 whitespace-nowrap px-3 py-2.5 text-foreground-secondary sm:px-4">
                        {semanticKindLabelRu(row.kind)}
                      </td>
                      <td className="min-w-0 px-3 py-2.5 break-words text-foreground-secondary sm:px-4">
                        {row.synonyms.join(", ")}
                      </td>
                      <td className="min-w-0 px-3 py-2.5 text-xs text-foreground-secondary sm:px-4">{formatRolesRu(row.roles)}</td>
                      <td className="min-w-0 px-3 py-2.5 break-words text-foreground-secondary sm:px-4">{row.exampleQuestion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isAdmin ? (
              <p className="mt-4 text-xs text-foreground-secondary">
                Редактирование пользовательских терминов:{" "}
                <Link href={"/dictionary" as Route} className="font-medium text-brand-600 underline-offset-2 hover:underline">
                  Словарь
                </Link>
                .
              </p>
            ) : null}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
