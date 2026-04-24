"use client";

import { useEffect } from "react";
import { useCurrentUser } from "@/hooks/api/use-auth";
import { setDefaultReportPdfMode, type ReportPdfMode } from "@/lib/preferences/report-pdf";

/** Подставляет режим PDF из `/auth/me` в localStorage для кнопок «PDF по умолчанию» вне страницы настроек. */
export function SyncUserPdfPreference() {
  const me = useCurrentUser();
  const mode = me.data?.profile?.default_report_pdf_mode;

  useEffect(() => {
    if (mode === "compact" || mode === "board") {
      setDefaultReportPdfMode(mode as ReportPdfMode);
    }
  }, [mode]);

  return null;
}
