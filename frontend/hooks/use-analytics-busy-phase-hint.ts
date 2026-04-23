"use client";

import { useEffect, useMemo, useState } from "react";

const BUSY_PHASE_LABELS = [
  "Этап: парсинг и интерпретация запроса…",
  "Этап: генерация SQL…",
  "Этап: проверка SQL…",
  "Этап: выполнение в базе…",
  "Этап: визуализация…",
  "Этап: инсайт и финализация…"
];

/** Пока ждём синхронный ответ API — циклические подсказки (реальные фазы приходят в trace.execution_phases). */
export function useAnalyticsBusyPhaseHint(active: boolean): string | null {
  const labels = useMemo(() => BUSY_PHASE_LABELS, []);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    const tick = () => setIndex((i) => (i + 1) % labels.length);
    const id = setInterval(tick, 880);
    return () => clearInterval(id);
  }, [active, labels.length]);

  if (!active) return null;
  return labels[index] ?? labels[0];
}
