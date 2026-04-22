export type InferredColumnDto = {
  name: string;
  type: string;
  nullable: boolean;
};

export type DataUploadPreviewDto = {
  file_name: string;
  inferred_schema: InferredColumnDto[];
  sample_rows: Record<string, string>[];
  warnings: string[];
};

export type DataUploadJobDto = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  file_name: string;
  table_name?: string;
  error_message?: string;
  created_at: string;
};
