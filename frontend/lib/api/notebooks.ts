import { requestJson } from "@/lib/api/request";
import { mockGetNotebook, mockListNotebooks } from "@/lib/api/mocks";
import { ApiError } from "@/lib/api/client";
import type {
  CreateNotebookRequestDto,
  NotebookDetailDto,
  NotebookListItemDto,
  SaveNotebookResponseDto,
  SaveNotebookScenarioRequestDto,
  UpdateNotebookRequestDto
} from "@/types/api/notebooks";

export async function fetchNotebooks(): Promise<NotebookListItemDto[]> {
  try {
    return await requestJson({
      path: "/api/v1/notebooks",
      init: { method: "GET", cache: "no-store" },
      mock: () => mockListNotebooks()
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      // Keep scenarios navigable in local demo mode when auth isn't configured.
      return mockListNotebooks();
    }
    throw error;
  }
}

export async function fetchNotebook(id: string): Promise<NotebookDetailDto> {
  try {
    return await requestJson({
      path: `/api/v1/notebooks/${encodeURIComponent(id)}`,
      init: { method: "GET", cache: "no-store" },
      mock: () => mockGetNotebook(id)
    });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return mockGetNotebook(id);
    }
    throw error;
  }
}

export async function createNotebook(body: CreateNotebookRequestDto): Promise<NotebookDetailDto> {
  return requestJson({
    path: "/api/v1/notebooks",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: async () => ({
      ...(await mockGetNotebook("new")),
      id: `nb-${Date.now()}`,
      title: body.title,
      created_at: new Date().toISOString()
    })
  });
}

export async function updateNotebook(id: string, body: UpdateNotebookRequestDto): Promise<NotebookDetailDto> {
  return requestJson({
    path: `/api/v1/notebooks/${encodeURIComponent(id)}`,
    init: { method: "PATCH", body: JSON.stringify(body) },
    mock: async () => {
      const base = await mockGetNotebook(id);
      return {
        ...base,
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.notebook_status !== undefined ? { notebook_status: body.notebook_status } : {})
      };
    }
  });
}

export async function deleteNotebook(id: string): Promise<void> {
  await requestJson<Record<string, never>>({
    path: `/api/v1/notebooks/${encodeURIComponent(id)}`,
    init: { method: "DELETE" },
    mock: async () => ({})
  });
}

export async function saveNotebookScenario(
  id: string,
  body: SaveNotebookScenarioRequestDto
): Promise<SaveNotebookResponseDto> {
  return requestJson({
    path: `/api/v1/notebooks/${encodeURIComponent(id)}/save`,
    init: { method: "POST", body: JSON.stringify(body) },
    mock: async () => ({
      notebook_id: id,
      context_chain_json: {
        scenario: { title: body.scenario_title, description: body.scenario_description ?? null }
      }
    })
  });
}
