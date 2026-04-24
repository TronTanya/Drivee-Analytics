import { apiFetchJson, ApiError } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";
import { mockListCorrections } from "@/lib/api/mocks";
import type { CorrectionDto, CreateCorrectionRequestDto } from "@/types/api/corrections";

let mockCorrectionsState: CorrectionDto[] | null = null;

async function getMockCorrectionsState(): Promise<CorrectionDto[]> {
  if (!mockCorrectionsState) {
    mockCorrectionsState = await mockListCorrections();
  }
  return mockCorrectionsState;
}

type AdminCorrectionRow = {
  id: string;
  workspace_id: string;
  original_query: string;
  generated_sql: string;
  corrected_sql: string;
  correction_type: string;
  created_at: string;
  updated_at: string;
  notes?: string | null;
};

function mapAdminCorrectionRow(row: AdminCorrectionRow): CorrectionDto {
  return {
    id: String(row.id),
    summary: row.original_query.slice(0, 220),
    proposed_fix: row.corrected_sql.slice(0, 500),
    status: "published",
    created_at: row.created_at,
    updated_at: row.updated_at,
    lifecycle: "record"
  };
}

function shouldCorrectionNetworkFallback(e: unknown): boolean {
  return (
    e instanceof TypeError ||
    (e instanceof ApiError && (e.status >= 500 || e.status === 404 || e.status === 401 || e.status === 403))
  );
}

function buildCorrectionCreatePayload(body: CreateCorrectionRequestDto): Record<string, unknown> {
  return {
    workspace_id: body.workspace_id,
    original_query: body.original_query,
    generated_sql: body.generated_sql,
    corrected_sql: body.corrected_sql,
    correction_type: body.correction_type,
    semantic_terms_before: body.semantic_terms_before ?? [],
    semantic_terms_after: body.semantic_terms_after ?? [],
    notes: body.notes ?? null
  };
}

async function appendMockCorrectionFromCreate(body: CreateCorrectionRequestDto): Promise<CorrectionDto> {
  const state = await getMockCorrectionsState();
  const item: CorrectionDto = {
    id: `corr-${Date.now()}`,
    summary: body.original_query.slice(0, 220),
    proposed_fix: body.corrected_sql.slice(0, 500),
    status: "pending",
    lifecycle: "mock",
    created_at: new Date().toISOString()
  };
  state.unshift(item);
  return item;
}

export async function fetchCorrections(workspaceId: string | undefined): Promise<CorrectionDto[]> {
  if (isApiMockOnly()) {
    return [...(await getMockCorrectionsState())];
  }
  if (!workspaceId?.trim()) {
    return [];
  }
  const path = `/api/v1/admin/corrections?workspace_id=${encodeURIComponent(workspaceId)}`;
  try {
    const rows = await apiFetchJson<AdminCorrectionRow[]>(path, { method: "GET", cache: "no-store" });
    return rows.map(mapAdminCorrectionRow);
  } catch (e) {
    if (isApiMockFallback() && shouldCorrectionNetworkFallback(e)) {
      return [...(await getMockCorrectionsState())];
    }
    throw e;
  }
}

export async function createCorrection(body: CreateCorrectionRequestDto): Promise<CorrectionDto> {
  const payload = buildCorrectionCreatePayload(body);
  if (isApiMockOnly()) {
    return appendMockCorrectionFromCreate(body);
  }
  try {
    const row = await apiFetchJson<AdminCorrectionRow>("/api/v1/admin/corrections", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return mapAdminCorrectionRow(row);
  } catch (e) {
    if (isApiMockFallback() && shouldCorrectionNetworkFallback(e)) {
      return appendMockCorrectionFromCreate(body);
    }
    throw e;
  }
}

export async function updateCorrectionStatus(
  id: string,
  status: CorrectionDto["status"]
): Promise<CorrectionDto> {
  if (id.startsWith("corr-")) {
    const state = await getMockCorrectionsState();
    const idx = state.findIndex((c) => c.id === id);
    if (idx === -1) {
      const fallback: CorrectionDto = {
        id,
        summary: "Исправление не найдено",
        proposed_fix: "Mock fallback",
        status,
        lifecycle: "mock",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      state.unshift(fallback);
      return fallback;
    }
    const updated: CorrectionDto = {
      ...state[idx],
      status,
      lifecycle: "mock",
      updated_at: new Date().toISOString()
    };
    state[idx] = updated;
    return updated;
  }
  throw new ApiError(
    "Обновление статуса исправлений для записей из БД пока не поддерживается (нет поля статуса в API).",
    501
  );
}
