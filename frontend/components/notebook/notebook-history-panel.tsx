"use client";

import type { NotebookHistoryItem } from "@/lib/notebook/notebook-history";

type NotebookHistoryPanelProps = {
  items: NotebookHistoryItem[];
  onSelect: (text: string) => void;
  onRerunLast?: () => void;
  disabled?: boolean;
  lastPromptText?: string;
  onClear?: () => void;
  /** Заголовок карточки (по умолчанию «История»). */
  heading?: string;
  /** Подзаголовок под заголовком. */
  subheading?: string;
};

export function NotebookHistoryPanel({
  items,
  onSelect,
  onRerunLast,
  disabled,
  lastPromptText,
  onClear,
  heading = "История",
  subheading = "Повторите запрос или вставьте текст в композер."
}: NotebookHistoryPanelProps) {
  return (
    <aside className="space-y-3 rounded-card border border-border-subtle bg-surface-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">{heading}</p>
          <p className="mt-0.5 text-xs text-foreground-secondary">{subheading}</p>
        </div>
        {onClear && items.length ? (
          <button
            type="button"
            onClick={onClear}
            disabled={disabled}
            className="shrink-0 rounded-control border border-border-subtle bg-surface-muted px-2 py-1 text-[11px] font-semibold text-foreground-secondary hover:border-brand-200 hover:text-brand-800 disabled:opacity-50"
          >
            Очистить
          </button>
        ) : null}
      </div>
      {onRerunLast && lastPromptText?.trim() ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRerunLast}
          className="w-full rounded-control border border-brand-200 bg-brand-50 px-3 py-2 text-left text-xs font-semibold text-brand-900 shadow-xs hover:bg-brand-100 disabled:opacity-50"
        >
          Повторить последний запрос
        </button>
      ) : null}
      <ul className="max-h-[min(52vh,28rem)] space-y-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <li className="rounded-control border border-dashed border-border-subtle bg-surface-muted/50 px-3 py-6 text-center text-xs text-foreground-muted">
            Здесь появятся последние промпты после успешного запуска.
          </li>
        ) : (
          items.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(h.text)}
                className="w-full rounded-control border border-border-subtle bg-surface-muted/60 px-3 py-2 text-left text-xs text-foreground transition hover:border-brand-200 hover:bg-brand-50/60 disabled:opacity-50"
              >
                <span className="line-clamp-3 font-medium leading-snug">{h.text}</span>
                <span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-foreground-muted">
                  {new Date(h.at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}

/** Компактная лента для мобильных экранов. */
export function NotebookHistoryChips({
  items,
  onSelect,
  disabled
}: {
  items: NotebookHistoryItem[];
  onSelect: (text: string) => void;
  disabled?: boolean;
}) {
  if (!items.length) return null;
  const recent = items.slice(0, 6);
  return (
    <div className="rounded-card border border-border-subtle bg-surface-card p-3 shadow-xs xl:hidden">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Недавние промпты</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {recent.map((h) => (
          <button
            key={h.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(h.text)}
            className="max-w-[220px] shrink-0 rounded-full border border-border-subtle bg-surface-muted px-3 py-1.5 text-left text-[11px] font-semibold text-foreground-secondary hover:border-brand-200 hover:text-brand-800 disabled:opacity-50"
          >
            <span className="line-clamp-2">{h.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
