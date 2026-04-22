import { requestJson } from "@/lib/api/request";
import { mockListDictionary } from "@/lib/api/mocks";
import type { DictionaryEntryDto, UpsertDictionaryEntryDto } from "@/types/api/dictionary";

export async function fetchDictionaryEntries(): Promise<DictionaryEntryDto[]> {
  return requestJson({
    path: "/api/v1/dictionary/entries",
    init: { method: "GET", cache: "no-store" },
    mock: () => mockListDictionary()
  });
}

export async function createDictionaryEntry(body: UpsertDictionaryEntryDto): Promise<DictionaryEntryDto> {
  return requestJson({
    path: "/api/v1/dictionary/entries",
    init: { method: "POST", body: JSON.stringify(body) },
    mock: async () => ({
      id: `d-${Date.now()}`,
      term: body.term,
      synonyms: body.synonyms,
      sql_expression: body.sql_expression,
      visibility_roles: body.visibility_roles,
      updated_at: new Date().toISOString()
    })
  });
}

export async function updateDictionaryEntry(
  id: string,
  body: UpsertDictionaryEntryDto
): Promise<DictionaryEntryDto> {
  return requestJson({
    path: `/api/v1/dictionary/entries/${encodeURIComponent(id)}`,
    init: { method: "PATCH", body: JSON.stringify(body) },
    mock: async () => ({
      id,
      term: body.term,
      synonyms: body.synonyms,
      sql_expression: body.sql_expression,
      visibility_roles: body.visibility_roles,
      updated_at: new Date().toISOString()
    })
  });
}

export async function deleteDictionaryEntry(id: string): Promise<void> {
  await requestJson<Record<string, never>>({
    path: `/api/v1/dictionary/entries/${encodeURIComponent(id)}`,
    init: { method: "DELETE" },
    mock: async () => ({})
  });
}
