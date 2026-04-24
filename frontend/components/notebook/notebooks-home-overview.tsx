import type { UserRole } from "@/lib/types";

const ROLE_TITLE: Record<UserRole, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  marketer: "Маркетолог",
  executive: "Руководитель"
};

function RoleGlyph({ role }: { role: UserRole }) {
  if (role === "admin") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
        <path d="M8 1.8 13 3.8v3.7c0 3.1-2.2 5.8-5 6.7-2.8-.9-5-3.6-5-6.7V3.8L8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (role === "manager") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
        <path d="M2 12.5h12M3.2 11V7.8M7.6 11V5.8M12 11V3.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (role === "marketer") {
    return (
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
        <path d="M2 10.5V5.8l8-2v8.6l-8-1.9Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M10 6.5h2.4M10 9.4h2.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
      <path d="M2.2 12.8h11.6V8.3H2.2v4.5ZM4.2 8.3V6.5c0-2.1 1.6-3.7 3.8-3.7s3.8 1.6 3.8 3.7v1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

const ROLE_FOCUS: Record<UserRole, string> = {
  admin: "Управление качеством данных, доступами и устойчивостью платформы",
  manager: "Операционные KPI, SLA и быстрые сценарии принятия решений",
  marketer: "Каналы, конверсия и маркетинговая эффективность",
  executive: "Стратегический контур: динамика, риски и прогноз"
};

const ROLE_ACCENT: Record<
  UserRole,
  {
    heroBorder: string;
    heroSoft: string;
    badge: string;
    trend: string;
  }
> = {
  admin: {
    heroBorder: "border-sky-200",
    heroSoft: "bg-sky-50/60",
    badge: "border-sky-200 bg-sky-50 text-sky-900",
    trend: "text-sky-700"
  },
  manager: {
    heroBorder: "border-brand-200",
    heroSoft: "bg-brand-50/60",
    badge: "border-brand-200 bg-brand-50 text-brand-900",
    trend: "text-emerald-700"
  },
  marketer: {
    heroBorder: "border-violet-200",
    heroSoft: "bg-violet-50/60",
    badge: "border-violet-200 bg-violet-50 text-violet-900",
    trend: "text-violet-700"
  },
  executive: {
    heroBorder: "border-amber-200",
    heroSoft: "bg-amber-50/60",
    badge: "border-amber-200 bg-amber-50 text-amber-900",
    trend: "text-amber-700"
  }
};

const ROLE_KPIS: Record<UserRole, { label: string; value: string; trend: string }[]> = {
  admin: [
    { label: "Качество SQL", value: "97%", trend: "+2% нед/нед" },
    { label: "Активные сценарии", value: "26", trend: "+4 за 7 дней" },
    { label: "Стабильность API", value: "99.9%", trend: "SLA выполнен" }
  ],
  manager: [
    { label: "Done rides", value: "18.4k", trend: "+6.2% нед/нед" },
    { label: "Cancel rate", value: "2.1%", trend: "-0.3 п.п." },
    { label: "SLA", value: "96.8%", trend: "+0.9 п.п." }
  ],
  marketer: [
    { label: "Conversion", value: "34.2%", trend: "+1.8 п.п." },
    { label: "CAC", value: "1 420", trend: "-7.4%" },
    { label: "Retention D7", value: "28%", trend: "+2.1 п.п." }
  ],
  executive: [
    { label: "Revenue", value: "184M", trend: "+9.6% квартал" },
    { label: "Forecast fit", value: "93%", trend: "стабильно" },
    { label: "Margin", value: "18.4%", trend: "+1.2 п.п." }
  ]
};

const FLOW = [
  "Вопрос",
  "Интерпретация",
  "SQL",
  "Проверка",
  "Результат",
  "Инсайт"
] as const;

export function NotebooksHomeOverview({ role }: { role: UserRole }) {
  const isAdmin = role === "admin";
  const kpis = ROLE_KPIS[role];
  const accent = ROLE_ACCENT[role];

  return (
    <div className="space-y-6">
      <section className={`surface-hero grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr] ${accent.heroBorder} ${accent.heroSoft}`}>
        <div>
          <p className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${accent.badge}`}>
            <RoleGlyph role={role} />
            Роль: {ROLE_TITLE[role]}
          </p>
          <h2 className="mt-3 text-heading-2 text-foreground">Ваш обзор аналитической системы</h2>
          <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
            {ROLE_FOCUS[role]}. Список ноутбуков вынесен в раздел «Сценарии», здесь — быстрый role-centric срез и маршрут работы.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {kpis.map((kpi) => (
              <article key={kpi.label} className="rounded-control border border-border-subtle bg-surface-card px-3 py-2 shadow-xs">
                <p className="text-[10px] uppercase tracking-wide text-foreground-muted">{kpi.label}</p>
                <p className="mt-1 text-base font-semibold text-foreground tabular-nums">{kpi.value}</p>
                <p className={`text-[11px] ${accent.trend}`}>{kpi.trend}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-control border border-border-subtle bg-surface-card p-3 shadow-xs">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Pipeline overview</p>
          <div className="mt-2 h-24 rounded-lg bg-surface-muted p-2">
            <svg viewBox="0 0 300 90" className="h-full w-full" aria-hidden>
              <polyline
                fill="none"
                stroke="currentColor"
                className="text-chart-1"
                strokeWidth="3"
                points="6,70 50,60 94,56 138,44 182,36 226,28 270,22 294,18"
              />
              <polyline
                fill="none"
                stroke="currentColor"
                className="text-brand-700"
                strokeWidth="3"
                points="6,76 50,68 94,64 138,58 182,50 226,44 270,38 294,34"
              />
            </svg>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {FLOW.map((step, i) => (
              <span
                key={step}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  i === 0 || i === FLOW.length - 1
                    ? "border-brand-200 bg-brand-50 text-brand-900"
                    : "border-border-subtle bg-surface-muted text-foreground-secondary"
                }`}
              >
                {step}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div className="rounded-card border border-border-subtle bg-surface-card p-5 shadow-xs">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Доступ к разделам</p>
        <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-foreground-secondary">
          <li>
            <span className="font-medium text-foreground">Сценарии</span> — у всех ролей; NL→SQL и ячейки внутри ноутбука.
          </li>
          <li>
            <span className="font-medium text-foreground">Дашборд</span> — KPI-экран по роли (ссылка «Дашборд» в меню).
          </li>
          {isAdmin ? (
            <li>
              <span className="font-medium text-foreground">Шаблоны, отчеты, история</span> — полный доступ у администратора.
            </li>
          ) : (
            <li>
              <span className="font-medium text-foreground">Шаблоны, отчеты, история</span> — доступны менеджеру, маркетологу и руководителю.
            </li>
          )}
          {isAdmin ? (
            <li>
              <span className="font-medium text-foreground">Словарь и коррекции</span> — только у администратора (governance).
            </li>
          ) : (
            <li>
              <span className="font-medium text-foreground">Словарь и коррекции</span> — в меню не показываются; раздел только для администратора.
            </li>
          )}
          <li>
            <span className="font-medium text-foreground">Настройки</span> — у всех ролей (профиль, PDF по умолчанию).
          </li>
        </ul>
        <p className="mt-4 text-xs text-foreground-muted">
          Расширенные модули (например AutoML Lab или загрузка данных) не в основном меню: к ним можно перейти по прямой ссылке, если маршрут разрешён для роли.
        </p>
      </div>
    </div>
  );
}

export function NotebooksHomeOverviewSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <section className="surface-hero grid gap-4 p-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-3">
          <div className="h-6 w-44 rounded-full bg-surface-muted" />
          <div className="h-8 w-80 rounded-lg bg-surface-muted" />
          <div className="h-4 w-full max-w-2xl rounded bg-surface-muted" />
          <div className="h-4 w-2/3 rounded bg-surface-muted" />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="rounded-control border border-border-subtle bg-surface-card px-3 py-2">
                <div className="h-3 w-20 rounded bg-surface-muted" />
                <div className="mt-2 h-5 w-16 rounded bg-surface-muted" />
                <div className="mt-2 h-3 w-24 rounded bg-surface-muted" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-control border border-border-subtle bg-surface-card p-3 shadow-xs">
          <div className="h-3 w-28 rounded bg-surface-muted" />
          <div className="mt-3 h-24 rounded-lg bg-surface-muted" />
          <div className="mt-3 flex gap-1.5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-5 w-16 rounded-full bg-surface-muted" />
            ))}
          </div>
        </div>
      </section>
      <div className="rounded-card border border-border-subtle bg-surface-card p-5 shadow-xs">
        <div className="h-3 w-32 rounded bg-surface-muted" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-4 w-full rounded bg-surface-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
