import { requestJson } from "@/lib/api/request";
import { mockListCorrections } from "@/lib/api/mocks";
import type { CorrectionDto, UpsertCorrectionDto } from "@/types/api/corrections";

let mockCorrectionsState: CorrectionDto[] | null = null;

async function getMockCorrectionsState(): Promise<CorrectionDto[]> {
  if (!mockCorrectionsState) {
    mockCorrectionsState = await mockListCorrections();
  }
  return mockCorrectionsState;
}

export async function fetchCorrections(): Promise<CorrectionDto[]> {
  return requestJson({
    path: "/api/v1/corrections",
    init: { method: "GET", cache: "no-store" },
    mock: async () => [...(await getMockCorrectionsState())]
  });
}

export async function createCorrection(body: UpsertCorrectionDto): Promise<CorrectionDto> {
  return requestJson({
    path: "/api/v1/corrections",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: async () => {
      const state = await getMockCorrectionsState();
      const item: CorrectionDto = {
        id: `corr-${Date.now()}`,
        status: "pending",
        created_at: new Date().toISOString(),
        ...body
      };
      state.unshift(item);
      return item;
    }
  });
}

export async function updateCorrectionStatus(
  id: string,
  status: CorrectionDto["status"]
): Promise<CorrectionDto> {
  return requestJson({
    path: `/api/v1/corrections/${encodeURIComponent(id)}`,
    init: { method: "PATCH", body: JSON.stringify({ status }) },
    mock: async () => {
      const state = await getMockCorrectionsState();
      const idx = state.findIndex((c) => c.id === id);
      if (idx === -1) {
        const fallback: CorrectionDto = {
          id,
          summary: "Исправление не найдено",
          proposed_fix: "Mock fallback",
          status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        state.unshift(fallback);
        return fallback;
      }
      const updated: CorrectionDto = {
        ...state[idx],
        status,
        updated_at: new Date().toISOString()
      };
      state[idx] = updated;
      return updated;
    }
  });
}
