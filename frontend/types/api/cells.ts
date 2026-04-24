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

export type ForecastSidecarMode = "auto" | "on" | "off";

export type RunCellRequestDto = {
  /** Optional override prompt / parameters */
  input?: string;
  forecast_horizon_steps?: number;
  forecast_sidecar?: ForecastSidecarMode;
  chart_type_override?: string | null;
};

export type RunCellResponseDto = {
  cell: NotebookCellDto;
  trace?: AnalyticsTraceDto;
};

export type RunNotebookAnalyticsRequestDto = {
  notebook_id: string;
  prompt: string;
  /** Пагинация превью таблицы; на backend до 1_000_000 (см. RunAnalyticsRequest). */
  result_limit?: number;
  result_offset?: number;
  force_fresh_dialogue?: boolean;
  skip_learned_corrections?: boolean;
  forecast_sidecar?: ForecastSidecarMode;
  chart_type_override?: string | null;
  forecast_horizon_steps?: number;
};

/** Опции только для тела запроса (без notebook_id / prompt). */
export type NotebookAnalyticsRunOptions = Omit<RunNotebookAnalyticsRequestDto, "notebook_id" | "prompt">;

export type RunNotebookAnalyticsResponseDto = {
  notebook_id: string;
  /** Wire cells; UI may map via `cellDtosToBlocks` */
  cells: NotebookCellDto[];
  trace: AnalyticsTraceDto;
  /** Unified E2E contract fields (backend live). */
  question?: string;
  interpreted_query?: string;
  safe_sql?: string;
  table?: {
    columns: string[];
    rows: Record<string, string | number>[];
    caption?: string;
  };
  chart?: Record<string, unknown>;
  insight?: string;
  confidence?: number;
  /** Поверхность после enrich контекста (например public.train). */
  resolved_source_table?: string;
  runtime_mode?: "live" | "fallback" | "mock-only";
};
