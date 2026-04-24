export type InferredColumnDto = {
  name: string;
  type: string;
  nullable: boolean;
};

export type DataUploadPreviewDto = {
  upload_id: string;
  import_job_id?: string;
  file_name: string;
  inferred_schema: InferredColumnDto[];
  sample_rows: Record<string, string>[];
  warnings: string[];
  metrics_preview?: Record<string, unknown>;
};

export type DataUploadJobDto = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  file_name?: string;
  table_name?: string;
  error_message?: string;
  created_at?: string;
  row_count?: number;
  semantic_column_map?: Record<string, string>;
  metrics?: Record<string, unknown>;
};
