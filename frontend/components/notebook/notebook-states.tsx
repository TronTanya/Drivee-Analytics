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
