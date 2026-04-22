"use client";

import { useMutation } from "@tanstack/react-query";
import { commitCsvImport, commitCsvUploadDirect, previewCsvUpload } from "@/lib/api/data-upload";

export function usePreviewCsvUpload() {
  return useMutation({
    mutationFn: (file: File) => previewCsvUpload(file)
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
