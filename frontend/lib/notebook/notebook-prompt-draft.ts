const STORAGE_PREFIX = "drivee_notebook_prompt_draft_v1:";

export type NotebookPromptDraftV1 = {
  cell: string;
  composer: string;
  updatedAt: string;
};

function parseDraft(raw: string): NotebookPromptDraftV1 | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    const cell = typeof o.cell === "string" ? o.cell : "";
    const composer = typeof o.composer === "string" ? o.composer : "";
    const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : new Date().toISOString();
    return { cell, composer, updatedAt };
  } catch {
    return null;
  }
}

export function loadNotebookPromptDraft(notebookId: string): NotebookPromptDraftV1 | null {
  if (typeof window === "undefined" || !notebookId) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + notebookId);
    if (!raw) return null;
    return parseDraft(raw);
  } catch {
    return null;
  }
}

export function saveNotebookPromptDraft(notebookId: string, draft: { cell: string; composer: string }): void {
  if (typeof window === "undefined" || !notebookId) return;
  const cell = draft.cell ?? "";
  const composer = draft.composer ?? "";
  try {
    if (!cell.trim() && !composer.trim()) {
      window.localStorage.removeItem(STORAGE_PREFIX + notebookId);
      return;
    }
    const payload: NotebookPromptDraftV1 = {
      cell,
      composer,
      updatedAt: new Date().toISOString()
    };
    window.localStorage.setItem(STORAGE_PREFIX + notebookId, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

export function clearNotebookPromptDraft(notebookId: string): void {
  if (typeof window === "undefined" || !notebookId) return;
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + notebookId);
  } catch {
    /* ignore */
  }
}
