"use client";

import { useMutation } from "@tanstack/react-query";
import { commitCsvImport, commitCsvUploadDirect, previewCsvUploadWithWorkspace } from "@/lib/api/data-upload";

export function usePreviewCsvUpload() {
  return useMutation({
    mutationFn: ({ file, workspaceId }: { file: File; workspaceId: string }) =>
      previewCsvUploadWithWorkspace(file, workspaceId)
  });
}

export function useCommitCsvImport() {
  return useMutation({
    mutationFn: (previewToken: string) => commitCsvImport(previewToken)
  });
}

export function useCommitCsvUploadDirect() {
  return useMutation({
    mutationFn: (file: File) => commitCsvUploadDirect(file)
  });
}
