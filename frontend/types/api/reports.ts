/** Контракты, совместимые с backend `SavedReportCreate` / list / detail. */

export type ReportPayloadDto = {
  prompt: string;
  notebook_context?: Record<string, unknown>;
  role_key?: string | null;
  interpreted_query?: string | null;
  generated_sql?: string | null;
  result_metadata?: Record<string, unknown>;
  chart_type?: string | null;
  chart_config?: Record<string, unknown>;
  result_snapshot?: Record<string, unknown>;
  creator_role_key?: string | null;
  creator_user_id?: string | null;
  trace_summary?: string | null;
  confidence?: number | null;
  warnings?: string[];
  captured_at?: string | null;
  saved_at?: string | null;
};

export type CreateSavedReportRequestDto = {
  workspace_id: string;
  title: string;
  description?: string | null;
  notebook_id?: string | null;
  payload?: ReportPayloadDto;
  source_cell_id?: string | null;
};

/** @deprecated используйте title — оставлено для старых вызовов */
export type LegacyCreateReportRequestDto = {
  name: string;
  format?: "pdf" | "slides" | "notebook" | "csv";
  notebook_id?: string;
  workspace_id?: string;
  payload?: ReportPayloadDto;
};

export type ReportScheduleApiDto = {
  id: string;
  report_id: string;
  cron_expression: string;
  timezone: string;
  is_active: boolean;
  delivery_channel: string;
  delivery_config_json: Record<string, unknown>;
  last_run_at?: string | null;
  next_run_at?: string | null;
  created_at: string;
  updated_at: string;
  frequency?: "daily" | "weekly" | "monthly" | null;
  hour_utc?: number | null;
  minute_utc?: number | null;
};

export type NotebookScenarioDto = {
  id: string;
  name: string;
  notebook_id: string;
  owner_email?: string | null;
  updated_at: string;
  schedule: string;
};

export type SavedReportListApiDto = {
  id: string;
  workspace_id: string;
  title: string;
  description?: string | null;
  notebook_id?: string | null;
  created_by?: string | null;
  creator_role_key?: string | null;
  is_shared: boolean;
  created_at: string;
  updated_at: string;
  has_schedule: boolean;
  report_format?: "pdf" | "csv" | "slides" | "notebook" | string;
};

export type SavedReportDetailApiDto = SavedReportListApiDto & {
  report_payload_json: Record<string, unknown>;
  schedule?: ReportScheduleApiDto | null;
};

export type RunSavedReportResponseDto = {
  report_id: string;
  execution_status: string;
  safe_sql: string;
  insight: string;
  chart_type: string;
  table_records: Record<string, unknown>[];
  confidence: number;
  warnings: string[];
  trace_summary: string;
  clarification_required: boolean;
};

export type CreateReportScheduleRequestDto = {
  frequency: "daily" | "weekly" | "monthly";
  hour_utc: number;
  minute_utc?: number;
  day_of_week?: number;
  day_of_month?: number;
  delivery_channel?: "in_app" | "email_mock";
  delivery_config_json?: Record<string, unknown>;
  is_active?: boolean;
};
