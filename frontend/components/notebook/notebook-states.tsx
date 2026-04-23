export function NotebookEmptyState({
  title = "Начните с вопроса",
  description = "Добавьте промпт ниже. Ассистент предложит SQL, визуализации и narrative-блоки на этой канве."
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="surface-section border-dashed bg-surface-card/85 px-6 py-14 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Сценарий</p>
      <h2 className="mt-2 text-heading-2 text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-foreground-secondary">{description}</p>
    </div>
  );
}

export function NotebookLoadingState({ label = "Загрузка сценария…" }: { label?: string }) {
  return (
    <div
      className="surface-section flex flex-col items-center justify-center gap-3 px-6 py-16"
      role="status"
      aria-live="polite"
    >
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      <p className="text-sm font-medium text-foreground-secondary">{label}</p>
    </div>
  );
}

export function NotebookPipelineLoadingState({
  title = "Выполняется аналитический pipeline",
  subtitle = "Интерпретация запроса, генерация SQL, проверка политик и выполнение в базе."
}: {
  title?: string;
  subtitle?: string;
}) {
  return (
    <div
      className="rounded-card border border-brand-200/60 bg-gradient-to-r from-brand-50/80 to-surface-card px-4 py-4 shadow-xs"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-xs text-foreground-secondary">{subtitle}</p>
          </div>
        </div>
        <div className="grid flex-1 gap-2 sm:max-w-md">
          <div className="h-2 animate-pulse rounded-full bg-surface-muted" />
          <div className="h-2 w-[84%] animate-pulse rounded-full bg-surface-muted" />
          <div className="h-2 w-[66%] animate-pulse rounded-full bg-surface-muted" />
        </div>
      </div>
    </div>
  );
}

export function NotebookNoDataState({
  title = "Нет данных для отображения",
  description = "Запрос выполнен, но результирующий набор пуст. Уточните фильтры или период."
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-muted/40 px-4 py-4 text-center shadow-xs">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Результат</p>
      <h3 className="mt-1 text-sm font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-xs text-foreground-secondary">{description}</p>
    </div>
  );
}

export function NotebookValidationBlockedState({
  title = "Запрос остановлен политиками безопасности",
  messages
}: {
  title?: string;
  messages: string[];
}) {
  if (!messages.length) return null;
  return (
    <div className="rounded-card border border-danger/30 bg-danger-soft px-4 py-3 shadow-xs" role="alert">
      <p className="text-sm font-semibold text-danger-bold">{title}</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-foreground">
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
    </div>
  );
}

export function NotebookClarificationNeededState({
  title = "Нужно уточнение",
  description = "Выберите вариант в блоке уточнения ниже — так мы снимем неоднозначность до выполнения SQL."
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 shadow-xs">
      <p className="text-sm font-semibold text-amber-950">{title}</p>
      <p className="mt-1 text-xs text-amber-900/90">{description}</p>
    </div>
  );
}

export function NotebookPartialResultState({
  title = "Частичный результат или предупреждения по качеству",
  reasons
}: {
  title?: string;
  reasons: string[];
}) {
  if (!reasons.length) return null;
  return (
    <div className="rounded-card border border-amber-200/80 bg-amber-50/90 px-4 py-3 shadow-xs">
      <p className="text-sm font-semibold text-amber-950">{title}</p>
      <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-950/90">
        {reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

export function NotebookFallbackModeState({
  message = "Клиент в демо-режиме: ответы могут быть упрощены или без реального выполнения в вашей БД."
}: {
  message?: string;
}) {
  return (
    <div className="rounded-card border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-950 shadow-xs">
      <span className="font-semibold">Режим fallback / mock</span>
      <span className="mx-1.5 text-sky-800/80">·</span>
      {message}
    </div>
  );
}

export function NotebookErrorBanner({
  title = "Что-то пошло не так",
  message,
  onRetry
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-card border border-danger/25 bg-danger-soft px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <div>
        <p className="text-sm font-semibold text-danger-bold">{title}</p>
        <p className="mt-0.5 text-sm text-foreground">{message}</p>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="interactive-focus shrink-0 rounded-control border border-danger/30 bg-surface-card px-3 py-1.5 text-xs font-semibold text-danger-bold hover:bg-white"
        >
          Повторить
        </button>
      ) : null}
    </div>
  );
}
