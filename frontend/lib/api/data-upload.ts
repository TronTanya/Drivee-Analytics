import { ApiError, apiFetchJson } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";
import { mockCreateUploadJob, mockUploadPreview } from "@/lib/api/mocks";
import { requestJson } from "@/lib/api/request";
import type { DataUploadJobDto, DataUploadPreviewDto } from "@/types/api/data-upload";

function fallbackOk(e: unknown): boolean {
  if (!isApiMockFallback()) return false;
  if (e instanceof TypeError) return true;
  if (e instanceof ApiError) return e.status >= 500 || e.status === 404;
  return false;
}

export async function previewCsvUpload(file: File): Promise<DataUploadPreviewDto> {
  if (isApiMockOnly()) return mockUploadPreview(file.name);
  const form = new FormData();
  form.append("file", file);
  try {
    return await apiFetchJson<DataUploadPreviewDto>("/api/v1/data/upload/preview", {
      method: "POST",
      body: form
    });
  } catch (e) {
    if (fallbackOk(e)) return mockUploadPreview(file.name);
    throw e;
  }
}

export async function commitCsvImport(previewToken: string): Promise<DataUploadJobDto> {
  return requestJson({
    path: "/api/v1/data/upload/commit",
    init: { method: "POST", body: JSON.stringify({ preview_token: previewToken }) },
    mock: () => mockCreateUploadJob()
  });
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
