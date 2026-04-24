import type { SqlCellProps } from "@/lib/notebook/block-types";
import { ValidationBadge } from "@/components/notebook/validation-badge";
import { UiStateSurface } from "@/components/ui/state-surface";

export function SqlCell({ block }: SqlCellProps) {
  if (!block.sql?.trim()) {
    return (
      <div className="space-y-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Предпросмотр SQL</span>
        <UiStateSurface
          variant="empty"
          title="SQL пока нет"
          description="Запрос не дошёл до генерации SQL (ожидается уточнение, ошибка валидации или сеть). Повторите запуск после исправления условий."
          dense
        />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">Предпросмотр SQL</span>
        {block.dialect ? (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-foreground-secondary">
            {block.dialect}
          </span>
        ) : null}
        {typeof block.validated === "boolean" ? <ValidationBadge ok={block.validated} /> : null}
      </div>
      <details className="group sm:hidden">
        <summary className="cursor-pointer rounded-control border border-border-subtle bg-surface-muted px-3 py-2 text-xs font-semibold text-foreground-secondary">
          Показать SQL
        </summary>
        <pre className="surface-console mt-2 max-h-72 overflow-auto p-3 font-mono text-[12px] leading-relaxed">
          <code>{block.sql}</code>
        </pre>
      </details>
      <pre className="surface-console hidden max-h-72 overflow-auto p-3 font-mono text-[13px] leading-relaxed sm:block">
        <code>{block.sql}</code>
      </pre>
    </div>
  );
}
