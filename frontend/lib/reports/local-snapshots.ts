"use client";

export type ReportSnapshot = {
  report_id: string;
  report_name: string;
  notebook_id?: string;
  prompt?: string;
  sql?: string;
  insight?: string;
  confidence?: number;
  warnings?: string[];
  table_preview?: Array<Record<string, string | number>>;
  created_at: string;
};

const SNAPSHOTS_KEY = "drivee.report_snapshots.v1";

function readAll(): ReportSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReportSnapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: ReportSnapshot[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(items.slice(0, 50)));
  } catch {
    // Ignore storage failures.
  }
}

export function upsertReportSnapshot(snapshot: ReportSnapshot): void {
  const current = readAll();
  const idx = current.findIndex((x) => x.report_id === snapshot.report_id);
  if (idx >= 0) {
    current[idx] = snapshot;
  } else {
    current.unshift(snapshot);
  }
  writeAll(current);
}

export function getReportSnapshot(reportId: string): ReportSnapshot | null {
  const current = readAll();
  return current.find((x) => x.report_id === reportId) ?? null;
}
