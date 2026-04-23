/**
 * Снимок сценария для демо-URL (slug вместо UUID), когда POST /notebooks/{uuid}/save недоступен.
 */

const STORAGE_PREFIX = "drivee.notebook_scenario_snapshot.v1:";

export type NotebookScenarioLocalSnapshot = {
  notebook_id: string;
  saved_at: string;
  scenario_title: string;
  scenario_description: string | null;
  /** JSON-сериализуемый снимок блоков канвы */
  blocks: unknown[];
};

export function saveNotebookScenarioLocal(snapshot: Omit<NotebookScenarioLocalSnapshot, "saved_at">): void {
  if (typeof window === "undefined" || !snapshot.notebook_id) return;
  const full: NotebookScenarioLocalSnapshot = {
    ...snapshot,
    saved_at: new Date().toISOString()
  };
  try {
    window.localStorage.setItem(STORAGE_PREFIX + snapshot.notebook_id, JSON.stringify(full));
  } catch {
    throw new Error("Не удалось записать в localStorage (квота или приватный режим).");
  }
}

export function loadNotebookScenarioLocal(notebookId: string): NotebookScenarioLocalSnapshot | null {
  if (typeof window === "undefined" || !notebookId) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + notebookId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NotebookScenarioLocalSnapshot;
    if (!parsed || typeof parsed !== "object" || parsed.notebook_id !== notebookId) return null;
    return parsed;
  } catch {
    return null;
  }
}
