"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import type { TracePanelProps } from "@/lib/notebook/block-types";
import { ConfidenceBadge } from "@/components/notebook/confidence-badge";
import { ValidationBadge } from "@/components/notebook/validation-badge";
import { TraceContextBadges } from "@/components/notebook/trace-context-badges";

const stepDot: Record<string, string> = {
  pending: "bg-foreground-muted",
  running: "bg-brand-500 animate-pulse-soft",
  done: "bg-slate-900",
  failed: "bg-danger"
};

function CollapsibleSection(props: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  muted?: boolean;
}) {
  const { title, defaultOpen = false, children, muted } = props;
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const panelId = `${id}-panel`;
  return (
    <div
      className={`overflow-hidden rounded-control border border-border-subtle ${muted ? "bg-surface-muted/40" : "bg-surface-card"}`}
    >
      <button
        type="button"
        className="interactive-focus flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-foreground transition hover:bg-surface-muted/60"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="w-4 shrink-0 text-[10px] text-foreground-muted" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
        <span className="uppercase tracking-wide">{title}</span>
      </button>
      {open ? (
        <div id={panelId} className="border-t border-border-subtle px-3 py-2.5 text-sm text-foreground-secondary">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function validationDerived(validationStatus: TracePanelProps["model"]["validationStatus"]): {
  ok: boolean;
  hint: string;
} {
  if (validationStatus === "passed") return { ok: true, hint: "Проверено" };
  if (validationStatus === "pending") return { ok: false, hint: "В ожидании" };
  if (validationStatus === "failed") return { ok: false, hint: "Ошибка" };
  return { ok: true, hint: "Не запускалось" };
}

export function TracePanel({ model, onClose, className = "" }: TracePanelProps) {
  const [compactMode, setCompactMode] = useState(false);
  const { ok, hint } = validationDerived(model.validationStatus);
  const hasSql = model.generatedSql.trim().length > 0;
  const hasEntities = Object.keys(model.extractedEntities).length > 0;
  const hasTerms = model.semanticTerms.length > 0;
  const hasTables = model.tablesUsed.length > 0;
  const hasCols = model.resultColumns.length > 0;
  const hasWarnings = model.warnings.length > 0;
  const chartType = model.chartRecommendation.chartType;
  const hasChartText =
    model.chartRecommendation.rationale.trim().length > 0 ||
    (chartType.length > 0 && chartType !== "table");
  const hasPipeline = model.steps.length > 0 || model.logs.length > 0;
  const hasBody = Boolean(
    hasSql ||
      hasEntities ||
      hasTerms ||
      hasTables ||
      hasCols ||
      hasWarnings ||
      hasChartText ||
      model.interpretedIntent.trim() ||
      hasPipeline ||
      model.forecastModeActive ||
      model.clarificationRequested
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setCompactMode(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return (
    <div
      className={`surface-section flex max-h-[min(85vh,900px)] flex-col shadow-card ${className}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border-subtle bg-surface-muted/35 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Explainability</p>
          <p className="truncate text-sm font-semibold text-foreground">Трассировка запроса</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <ConfidenceBadge value={model.confidence} />
          <ValidationBadge ok={ok} label={hint} />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="interactive-focus rounded-control p-1 text-foreground-muted transition hover:bg-surface-muted hover:text-foreground"
              aria-label="Закрыть trace"
            >
              ×
            </button>
          ) : null}
        </div>
      </div>

      <div className="border-b border-border-subtle px-4 py-2">
        <TraceContextBadges
          clarificationRequested={model.clarificationRequested}
          followUpContextUsed={model.followUpContextUsed}
          learnedCorrectionUsed={model.learnedCorrectionUsed}
          forecastModeActive={model.forecastModeActive}
        />
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-foreground-secondary">
          <span className="rounded-md border border-border-subtle bg-surface-muted px-2 py-0.5 font-mono">
            График: {model.chartRecommendation.chartType}
          </span>
          {model.forecastModeActive ? (
            <span className="rounded-md border border-border-subtle bg-surface-muted px-2 py-0.5 font-mono">
              Прогноз: {model.forecastMethod ?? "—"}
            </span>
          ) : (
            <span className="rounded-md border border-dashed border-border-subtle px-2 py-0.5 text-foreground-muted">
              Прогноз: выкл
            </span>
          )}
          <span
            className={`rounded-md border px-2 py-0.5 font-mono ${
              model.qualityGate.status === "failed"
                ? "border-danger/30 bg-danger-soft text-danger-bold"
                : model.qualityGate.status === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            Quality gate: {model.qualityGate.status}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!hasBody ? (
          <p className="text-sm text-foreground-secondary">Запустите ячейку, чтобы заполнить explainability trace.</p>
        ) : (
          <div className="space-y-2">
            <CollapsibleSection title="Интерпретированное намерение" defaultOpen>
              <p className="text-foreground">{model.interpretedIntent || "—"}</p>
            </CollapsibleSection>

            <CollapsibleSection title="Извлеченные сущности" defaultOpen={!compactMode && hasEntities}>
              {hasEntities ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-control border border-border-subtle bg-surface-muted/50 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                  {JSON.stringify(model.extractedEntities, null, 2)}
                </pre>
              ) : (
                <p className="text-foreground-muted">Для этого запуска нет структурированных сущностей.</p>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Семантические термины" defaultOpen={!compactMode && hasTerms}>
              {hasTerms ? (
                <ul className="space-y-2 text-xs">
                  {model.semanticTerms.map((t, i) => (
                    <li key={`${t.termKey}-${i}`} className="rounded-md border border-border-subtle bg-surface-muted/50 px-2 py-1.5">
                      <span className="font-semibold text-foreground">{t.surfaceForm || t.termKey}</span>
                      {t.termKey ? (
                        <span className="ml-2 font-mono text-[11px] text-foreground-secondary">{t.termKey}</span>
                      ) : null}
                      {t.sqlFragment ? (
                        <p className="mt-1 font-mono text-[11px] text-foreground-secondary">{t.sqlFragment}</p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-foreground-secondary">Уверенность {(t.confidence * 100).toFixed(0)}%</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-foreground-muted">Семантические разрешения не зафиксированы.</p>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Таблицы и колонки" defaultOpen={hasTables || hasCols}>
              {hasTables ? (
                <p>
                  <span className="text-xs font-semibold text-foreground-muted">Таблицы</span>
                  <span className="ml-2 font-mono text-xs text-foreground">{model.tablesUsed.join(", ") || "—"}</span>
                </p>
              ) : (
                <p className="text-foreground-muted">В этом trace нет списка таблиц.</p>
              )}
              {hasCols ? (
                <p className={hasTables ? "mt-2" : ""}>
                  <span className="text-xs font-semibold text-foreground-muted">Результирующие колонки</span>
                  <span className="ml-2 font-mono text-xs text-foreground">{model.resultColumns.join(", ")}</span>
                </p>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="Сгенерированный SQL" defaultOpen={!compactMode && hasSql}>
              {hasSql ? (
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-700/70 bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] p-2 font-mono text-[11px] leading-relaxed text-slate-100">
                  {model.generatedSql}
                </pre>
              ) : (
                <p className="text-foreground-muted">SQL отсутствует (например, ожидается уточнение).</p>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Валидация и предупреждения" defaultOpen>
              <p className="mb-2 text-xs">
                <span className="font-semibold text-foreground-muted">Статус:</span>{" "}
                <span className="font-medium capitalize text-foreground">{model.validationStatus}</span>
              </p>
              {hasWarnings ? (
                <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-950">
                  {model.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-foreground-muted">Предупреждений нет.</p>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Рекомендация графика" defaultOpen={!compactMode && hasChartText}>
              <p className="text-xs font-semibold text-foreground">{model.chartRecommendation.chartType}</p>
              {model.chartRecommendation.rationale ? (
                <p className="mt-1 text-sm text-foreground-secondary">{model.chartRecommendation.rationale}</p>
              ) : null}
              <p className="mt-1 text-xs text-foreground-muted">
                Тип графика можно переключить вручную в chart block без повторного SQL-запроса.
              </p>
              {model.chartRecommendation.alternatives.length > 0 ? (
                <p className="mt-2 text-xs text-foreground-muted">
                  Альтернативы: {model.chartRecommendation.alternatives.join(", ")}
                </p>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="Прогноз" defaultOpen={!compactMode && model.forecastModeActive}>
              <p className="text-sm">
                <span className="font-semibold text-foreground-muted">Активен:</span>{" "}
                {model.forecastModeActive ? "Да" : "Нет"}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold text-foreground-muted">Метод:</span>{" "}
                <span className="font-mono text-xs">{model.forecastMethod ?? "—"}</span>
              </p>
              <p className="mt-1 text-sm">
                <span className="font-semibold text-foreground-muted">Выбранная стратегия:</span>{" "}
                <span className="font-mono text-xs">{model.forecastSelection.selectedStrategy ?? "—"}</span>
              </p>
              {Object.keys(model.forecastSelection.dataQuality).length > 0 ? (
                <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-control border border-border-subtle bg-surface-muted/50 p-2 font-mono text-[11px] leading-relaxed text-foreground">
                  {JSON.stringify(model.forecastSelection.dataQuality, null, 2)}
                </pre>
              ) : null}
            </CollapsibleSection>

            <CollapsibleSection title="Quality gate" defaultOpen>
              <p className="text-sm">
                <span className="font-semibold text-foreground-muted">Статус:</span>{" "}
                <span className="font-medium capitalize text-foreground">{model.qualityGate.status}</span>
              </p>
              {model.qualityGate.reasons.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-foreground-secondary">
                  {model.qualityGate.reasons.map((reason, i) => (
                    <li key={`${reason}-${i}`}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-foreground-muted">Деградаций качества не обнаружено.</p>
              )}
            </CollapsibleSection>

            {hasPipeline ? (
              <CollapsibleSection title="Таймлайн pipeline" muted defaultOpen={!compactMode}>
                {model.steps.length > 0 ? (
                  <ul className="mb-3 space-y-2">
                    {model.steps.map((s) => (
                      <li key={s.id} className="flex gap-2 text-xs">
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${stepDot[s.status] ?? stepDot.pending}`}
                        />
                        <div>
                          <p className="font-medium text-foreground">{s.label}</p>
                          {s.detail ? <p className="text-foreground-secondary">{s.detail}</p> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {model.logs.length > 0 ? (
                  <ul className="space-y-1 font-mono text-[11px] leading-relaxed text-foreground-secondary">
                    {model.logs.map((l, i) => (
                      <li key={i} className="border-l-2 border-border-subtle pl-2">
                        {l.at ? <span className="text-foreground-muted">[{l.at}] </span> : null}
                        <span
                          className={
                            l.level === "error"
                              ? "text-danger"
                              : l.level === "warn"
                                ? "text-warning-bold"
                                : "text-foreground-secondary"
                          }
                        >
                          {l.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CollapsibleSection>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
