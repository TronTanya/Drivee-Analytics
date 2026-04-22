"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNotebook,
  deleteNotebook,
  fetchNotebook,
  fetchNotebooks,
  updateNotebook
} from "@/lib/api/notebooks";
import { queryKeys } from "@/hooks/api/query-keys";
import type { CreateNotebookRequestDto, UpdateNotebookRequestDto } from "@/types/api/notebooks";

export function useNotebooks() {
  return useQuery({
    queryKey: queryKeys.notebooks.list(),
    queryFn: fetchNotebooks,
    staleTime: 30_000
  });
}

export function useNotebook(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.notebooks.detail(id ?? ""),
    queryFn: () => fetchNotebook(id!),
    enabled: Boolean(id),
    staleTime: 30_000
  });
}

export function useCreateNotebook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateNotebookRequestDto) => createNotebook(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notebooks.all });
    }
  });
}

export function useUpdateNotebook(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateNotebookRequestDto) => updateNotebook(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notebooks.detail(id) });
      qc.invalidateQueries({ queryKey: queryKeys.notebooks.list() });
    }
  });
}

export function useDeleteNotebook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (notebookId: string) => deleteNotebook(notebookId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notebooks.all });
    }
  });
}
