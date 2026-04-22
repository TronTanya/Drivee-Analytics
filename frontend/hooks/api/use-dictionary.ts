"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDictionaryEntry,
  deleteDictionaryEntry,
  fetchDictionaryEntries,
  updateDictionaryEntry
} from "@/lib/api/dictionary";
import { queryKeys } from "@/hooks/api/query-keys";
import type { UpsertDictionaryEntryDto } from "@/types/api/dictionary";

export function useDictionaryEntries() {
  return useQuery({
    queryKey: queryKeys.dictionary.entries(),
    queryFn: fetchDictionaryEntries,
    staleTime: 60_000
  });
}

export function useCreateDictionaryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertDictionaryEntryDto) => createDictionaryEntry(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dictionary.all });
    }
  });
}

export function useUpdateDictionaryEntry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertDictionaryEntryDto) => updateDictionaryEntry(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dictionary.all });
    }
  });
}

export function useDeleteDictionaryEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => deleteDictionaryEntry(entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dictionary.all });
    }
  });
}
