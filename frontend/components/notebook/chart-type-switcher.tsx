import type { ChartKind } from "@/lib/notebook/block-types";
import type { ChartTypeSwitcherProps } from "@/lib/notebook/block-types";

const OPTIONS: { value: ChartKind; label: string }[] = [
  { value: "line", label: "Линия" },
  { value: "area", label: "Область" },
  { value: "bar", label: "Столбцы" },
  { value: "horizontal_bar", label: "Горизонтальные" },
  { value: "stacked_bar", label: "Стек" },
  { value: "pie", label: "Круг" },
  { value: "donut", label: "Donut" },
  { value: "scatter", label: "Scatter" },
  { value: "combo", label: "Комбо" },
  { value: "radar", label: "Radar" },
  { value: "heatmap", label: "Heatmap" },
  { value: "geo_bubble", label: "Geo bubble" },
  { value: "map", label: "Карта" },
  { value: "table", label: "Таблица" }
];

export function ChartTypeSwitcher({ value, onChange, options, className = "" }: ChartTypeSwitcherProps) {
  const visible = options?.length ? OPTIONS.filter((opt) => options.includes(opt.value)) : OPTIONS;
  return (
    <div
      className={`inline-flex rounded-control border border-border-subtle bg-surface-muted p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ${className}`}
      role="group"
      aria-label="Тип графика"
    >
      {visible.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className={`interactive-focus rounded-[6px] px-2.5 py-1 text-xs font-semibold transition ${
              active
                ? "bg-surface-card text-brand-800 shadow-xs"
                : "text-foreground-secondary hover:bg-surface-card/70 hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
