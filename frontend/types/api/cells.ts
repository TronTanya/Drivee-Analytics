import type { NotebookCellType } from "@/lib/types";
import type { AnalyticsTraceDto } from "@/types/api/trace";

export type { AnalyticsTraceDto } from "@/types/api/trace";

export type NotebookCellDto = {
  id: string;
  notebook_id: string;
  type: NotebookCellType;
  content: string;
  position?: number;
  /** Opaque JSON for structured cells (table/chart) when backend sends payloads */
  payload?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type AppendCellRequestDto = {
  type: NotebookCellType;
  content: string;
  payload?: Record<string, unknown>;
};

export type RunCellRequestDto = {
  /** Optional override prompt / parameters */
  input?: string;
};

export type RunCellResponseDto = {
  cell: NotebookCellDto;
  trace?: AnalyticsTraceDto;
};

export type RunNotebookAnalyticsRequestDto = {
  notebook_id: string;
  prompt: string;
};

export type RunNotebookAnalyticsResponseDto = {
  notebook_id: string;
  /** Wire cells; UI may map via `cellDtosToBlocks` */
  cells: NotebookCellDto[];
  trace: AnalyticsTraceDto;
};
