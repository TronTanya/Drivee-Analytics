"use client";

type PillProps = { active: boolean; label: string; activeLabel?: string };

function Pill({ active, label, activeLabel }: PillProps) {
  const text = active ? activeLabel ?? label : label;
  const styles = active
    ? "border-brand-200 bg-brand-50 text-brand-900"
    : "border-border-subtle bg-surface-muted text-foreground-secondary";
  return (
    <span
      className={`inline-flex max-w-[11rem] truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles}`}
      title={text}
    >
      {text}
    </span>
  );
}

export function TraceContextBadges(props: {
  clarificationRequested: boolean;
  followUpContextUsed: boolean;
  learnedCorrectionUsed: boolean;
  forecastModeActive: boolean;
  className?: string;
}) {
  const {
    clarificationRequested,
    followUpContextUsed,
    learnedCorrectionUsed,
    forecastModeActive,
    className = ""
  } = props;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      <Pill active={clarificationRequested} label="Без уточнения" activeLabel="Нужно уточнение" />
      <Pill active={followUpContextUsed} label="Новый контекст" activeLabel="Follow-up контекст" />
      <Pill active={learnedCorrectionUsed} label="SQL по умолчанию" activeLabel="Использован learned fix" />
      <Pill active={forecastModeActive} label="Прогноз выключен" activeLabel="Прогноз включен" />
    </div>
  );
}
