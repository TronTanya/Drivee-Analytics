export type UserRole = "admin" | "manager" | "marketer" | "executive";

export type NotebookCellType =
  | "prompt"
  | "clarification"
  | "sql"
  | "table"
  | "chart"
  | "insight"
  | "trace"
  | "forecast";

export interface NotebookCell {
  id: string;
  type: NotebookCellType;
  content: string;
}

/** API list row — canonical DTO in `types/api/notebooks` */
export type NotebookListItem = import("@/types/api/notebooks").NotebookListItemDto;

/** Legacy / mock notebook with cells */
export interface Notebook {
  id: string;
  title: string;
  role: UserRole;
  createdAt: string;
  cells: NotebookCell[];
}

/** Analytics pipeline response — see `types/api/cells` */
export type AnalyticsResponse = import("@/types/api/cells").RunNotebookAnalyticsResponseDto;
