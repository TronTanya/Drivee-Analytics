const STORAGE_PREFIX = "drivee_notebook_prompt_history_v1:";

export type NotebookHistoryItem = {
  id: string;
  text: string;
  at: string;
};

export function loadNotebookHistory(notebookId: string): NotebookHistoryItem[] {
  if (typeof window === "undefined" || !notebookId) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + notebookId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const text = typeof o.text === "string" ? o.text.trim() : "";
        if (!text) return null;
        return {
          id: typeof o.id === "string" ? o.id : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          text,
          at: typeof o.at === "string" ? o.at : new Date().toISOString()
        };
      })
      .filter((x): x is NotebookHistoryItem => Boolean(x));
  } catch {
    return [];
  }
}

export function saveNotebookHistory(notebookId: string, items: NotebookHistoryItem[]): void {
  if (typeof window === "undefined" || !notebookId) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + notebookId, JSON.stringify(items.slice(0, 40)));
  } catch {
    /* ignore quota */
  }
}

export function appendNotebookHistory(notebookId: string, text: string, prev: NotebookHistoryItem[]): NotebookHistoryItem[] {
  const trimmed = text.trim();
  if (!trimmed) return prev;
  const entry: NotebookHistoryItem = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`,
    text: trimmed,
    at: new Date().toISOString()
  };
  const deduped = prev.filter((h) => h.text !== trimmed);
  return [entry, ...deduped].slice(0, 40);
}
