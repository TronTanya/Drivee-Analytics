export type CorrectionStatusDto = "pending" | "approved" | "rejected" | "published";

/** `mock` — демо-строки с approve/reject; `record` — из БД, только просмотр (бэкенд без статусов). */
export type CorrectionLifecycleDto = "mock" | "record";

export type CorrectionDto = {
  id: string;
  notebook_id?: string;
  cell_id?: string;
  summary: string;
  proposed_fix: string;
  status: CorrectionStatusDto;
  created_at: string;
  updated_at?: string;
  author_user_id?: string;
  lifecycle?: CorrectionLifecycleDto;
};

/** Соответствует backend `QueryCorrectionCreate` (`POST /api/v1/admin/corrections`). */
export type CorrectionTypeApiDto = "sql_rewrite" | "semantic_mapping";

export type CreateCorrectionRequestDto = {
  workspace_id: string;
  original_query: string;
  generated_sql: string;
  corrected_sql: string;
  correction_type: CorrectionTypeApiDto;
  semantic_terms_before?: string[];
  semantic_terms_after?: string[];
  notes?: string | null;
};
