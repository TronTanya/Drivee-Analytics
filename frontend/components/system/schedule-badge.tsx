import type { ScheduleState } from "@/lib/system/mock-data";

const styles: Record<ScheduleState, string> = {
  active: "bg-emerald-50 text-emerald-900 border-emerald-200",
  paused: "bg-amber-50 text-amber-900 border-amber-200",
  none: "bg-surface-muted text-foreground-secondary border-border-subtle"
};

export function ScheduleBadge({ state }: { state: ScheduleState }) {
  const label = state === "active" ? "По расписанию" : state === "paused" ? "На паузе" : "Вручную";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[state]}`}>
      {label}
    </span>
  );
}
