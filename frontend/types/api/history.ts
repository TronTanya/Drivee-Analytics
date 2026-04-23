export type QueryHistoryFilters = {
  q?: string;
  date_from?: string;
  date_to?: string;
  /** trips_by_city | cancellations | conversion | avg_check | orders_trend | all */
  query_type?: string;
  scope?: "mine" | "workspace";
  owner_user_id?: string;
};

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
  chart_type?: string;
  interpreted_summary?: string;
  owner_user_id?: string;
  rerun_cell_id?: string;
  rerun_notebook_id?: string;
  save_as_report_body_hint?: Record<string, unknown>;
};
