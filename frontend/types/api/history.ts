export type NotebookRunStatusDto = "success" | "failed" | "partial";

export type NotebookRunDto = {
  id: string;
  ran_at: string;
  notebook_id: string;
  notebook_title: string;
  status: NotebookRunStatusDto;
  validation_ok: boolean;
  validation_hint: string;
  trace_summary: string;
  duration_ms: number;
};

export type QueryHistoryDto = {
  id: string;
  ran_at: string;
  label: string;
  sql_preview: string;
  notebook_id?: string;
  validation_ok: boolean;
  validation_hint: string;
  duration_ms: number;
};
