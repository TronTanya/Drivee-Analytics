import type { Route } from "next";
import Link from "next/link";
import { SectionCard } from "@/components/dashboard/section-card";
import { DemoQuickActions } from "@/components/system/demo-quick-actions";
import { SystemPageIntro } from "@/components/system/system-page-intro";
import type { UserRole } from "@/lib/types";
import type { NotebookTemplateRow, QueryTemplateRow } from "@/lib/system/mock-data";
import { MOCK_NOTEBOOK_TEMPLATES, MOCK_QUERY_TEMPLATES } from "@/lib/system/mock-data";

const ROLE_ORDER: UserRole[] = ["admin", "manager", "marketer", "executive"];
const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  marketer: "Маркетолог",
  executive: "Руководитель"
};

function groupByRole<T extends { role: UserRole }>(rows: T[]): Record<UserRole, T[]> {
  const out: Record<UserRole, T[]> = {
    admin: [],
    manager: [],
    marketer: [],
    executive: []
  };
  for (const row of rows) {
    out[row.role].push(row);
  }
  return out;
}

function QuickRunButton({ href, label }: { href: Route; label: string }) {
  return (
    <Link
      href={href}
      className="interactive-focus micro-lift inline-flex w-full justify-center rounded-control bg-brand-500 px-2.5 py-1 text-[11px] font-semibold text-black shadow-xs hover:bg-brand-400 active:translate-y-0 sm:w-auto"
    >
      {label}
    </Link>
  );
}

function QueryTemplateCard({ row }: { row: QueryTemplateRow }) {
  return (
    <div className="surface-content bg-surface-page px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{row.name}</p>
          <p className="mt-0.5 text-xs text-foreground-secondary">{row.description}</p>
          <pre className="surface-console mt-2 max-h-20 overflow-auto p-2 font-mono text-[10px]">
            {row.sql}
          </pre>
        </div>
        <div className="w-full sm:w-auto">
          <QuickRunButton href={row.runHref} label="Быстрый запуск" />
        </div>
      </div>
    </div>
  );
}

function NotebookTemplateCard({ row }: { row: NotebookTemplateRow }) {
  return (
    <div className="surface-content bg-surface-page px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{row.name}</p>
          <p className="mt-0.5 text-xs text-foreground-secondary">{row.description}</p>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row">
          <Link
            href={row.href as Route}
            className="interactive-focus rounded-control border border-border-subtle bg-surface-card px-2.5 py-1 text-center text-[11px] font-semibold text-foreground-secondary hover:bg-surface-muted"
          >
            Открыть
          </Link>
          <QuickRunButton href={row.href as Route} label="Быстрый запуск" />
        </div>
      </div>
    </div>
  );
}

export function TemplatesView() {
  const byQuery = groupByRole(MOCK_QUERY_TEMPLATES);
  const byNb = groupByRole(MOCK_NOTEBOOK_TEMPLATES);

  return (
    <div className="space-y-8">
      <SystemPageIntro
        title="Шаблоны"
        subtitle="Переиспользуемые SQL-сниппеты и заготовки сценариев, сгруппированные по ролям."
      />
      <DemoQuickActions
        items={[
          { label: "Открыть сценарии", href: "/notebooks", hint: "Продолжить на канве сценария" },
          { label: "Открыть словарь", href: "/dictionary", hint: "Проверить семантические определения" },
          { label: "Открыть историю", href: "/history", hint: "Просмотреть прошлые запуски шаблонов" }
        ]}
      />

      <SectionCard title="Шаблоны запросов" description="Параметризованные заготовки для SQL-ячейки и планировщика.">
        <div className="space-y-8">
          {ROLE_ORDER.map((role) => (
            <div key={role}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-800">
                {ROLE_LABEL[role]}
              </h3>
              <div className="space-y-2">
                {byQuery[role].map((row) => (
                  <QueryTemplateCard key={row.id} row={row} />
                ))}
                {byQuery[role].length === 0 ? (
                  <p className="text-xs text-foreground-muted">Для этой роли нет шаблонов запросов.</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Шаблоны сценариев" description="Готовые канвы под рабочие сценарии.">
        <div className="space-y-8">
          {ROLE_ORDER.map((role) => (
            <div key={`nb-${role}`}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-brand-800">
                {ROLE_LABEL[role]}
              </h3>
              <div className="space-y-2">
                {byNb[role].map((row) => (
                  <NotebookTemplateCard key={row.id} row={row} />
                ))}
                {byNb[role].length === 0 ? (
                  <p className="text-xs text-foreground-muted">Для этой роли нет шаблонов сценариев.</p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
