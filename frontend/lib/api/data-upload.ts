import { ApiError, apiFetchJson } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";
import { mockCreateUploadJob, mockUploadPreview } from "@/lib/api/mocks";
import type { DataUploadJobDto, DataUploadPreviewDto } from "@/types/api/data-upload";

function fallbackOk(e: unknown): boolean {
  if (!isApiMockFallback()) return false;
  if (e instanceof TypeError) return true;
  if (e instanceof ApiError) return e.status >= 500 || e.status === 404;
  return false;
}

export async function previewCsvUpload(file: File): Promise<DataUploadPreviewDto> {
  return previewCsvUploadWithWorkspace(file, "");
}

type UploadCreateApi = {
  upload_id: string;
  import_job_id?: string;
  file_name: string;
  inferred_schema?: {
    columns?: Array<{
      original_name?: string;
      inferred_type?: string;
      null_ratio?: number;
    }>;
    sample_rows?: Array<Record<string, string>>;
    warnings?: string[];
  };
  metrics_preview?: Record<string, unknown>;
};

type ImportRunApi = {
  upload_id: string;
  job_id: string;
  qualified_table: string;
  row_count: number;
  semantic_column_map?: Record<string, string>;
  metrics?: Record<string, unknown>;
};

function mapUploadPreview(row: UploadCreateApi): DataUploadPreviewDto {
  const cols = row.inferred_schema?.columns ?? [];
  return {
    upload_id: row.upload_id,
    import_job_id: row.import_job_id,
    file_name: row.file_name,
    inferred_schema: cols.map((c) => ({
      name: String(c.original_name ?? ""),
      type: String(c.inferred_type ?? "text"),
      nullable: Number(c.null_ratio ?? 0) > 0
    })),
    sample_rows: (row.inferred_schema?.sample_rows ?? []) as Record<string, string>[],
    warnings: (row.inferred_schema?.warnings ?? []) as string[],
    metrics_preview: row.metrics_preview ?? {}
  };
}

export async function previewCsvUploadWithWorkspace(file: File, workspaceId: string): Promise<DataUploadPreviewDto> {
  if (isApiMockOnly()) return mockUploadPreview(file.name);
  const form = new FormData();
  if (workspaceId?.trim()) {
    form.append("workspace_id", workspaceId.trim());
  }
  form.append("file", file);
  try {
    const row = await apiFetchJson<UploadCreateApi>("/api/v1/data/upload", {
      method: "POST",
      body: form
    });
    return mapUploadPreview(row);
  } catch (e) {
    if (fallbackOk(e)) return mockUploadPreview(file.name);
    throw e;
  }
}

export async function commitCsvImport(uploadId: string): Promise<DataUploadJobDto> {
  if (isApiMockOnly()) return mockCreateUploadJob();
  try {
    const row = await apiFetchJson<ImportRunApi>(`/api/v1/data/import/${encodeURIComponent(uploadId)}/run`, {
      method: "POST"
    });
    return {
      id: row.job_id,
      status: "completed",
      table_name: row.qualified_table,
      row_count: row.row_count,
      semantic_column_map: row.semantic_column_map ?? {},
      metrics: row.metrics ?? {}
    };
  } catch (e) {
    if (fallbackOk(e)) return mockCreateUploadJob();
    throw e;
  }
}

export async function commitCsvUploadDirect(file: File): Promise<DataUploadJobDto> {
  if (isApiMockOnly()) return mockCreateUploadJob();
  const form = new FormData();
  form.append("file", file);
  try {
    return await apiFetchJson<DataUploadJobDto>("/api/v1/data/upload", {
      method: "POST",
      body: form
    });
  } catch (e) {
    if (fallbackOk(e)) return mockCreateUploadJob();
    throw e;
  }
}
