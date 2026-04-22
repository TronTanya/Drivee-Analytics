"use client";

export type ReportPdfMode = "compact" | "board";

const REPORT_PDF_MODE_KEY = "drivee.report_pdf_mode.v1";
const DEFAULT_MODE: ReportPdfMode = "board";

export function getDefaultReportPdfMode(): ReportPdfMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    const value = window.localStorage.getItem(REPORT_PDF_MODE_KEY);
    if (value === "compact" || value === "board") return value;
    return DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export function setDefaultReportPdfMode(mode: ReportPdfMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REPORT_PDF_MODE_KEY, mode);
  } catch {
    // Ignore storage errors.
  }
}
