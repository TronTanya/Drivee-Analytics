import type { ReactNode } from "react";
import type { NotebookAnalyticsRunOptions } from "@/types/api/cells";

/** Runtime state for a block in the canvas */
export type CellRunStatus = "idle" | "running" | "success" | "error";

export type ChartKind =
  | "line"
  | "bar"
  | "area"
  | "horizontal_bar"
  | "stacked_bar"
  | "combo"
  | "pie"
  | "donut"
  | "scatter"
  | "radar"
  | "heatmap"
  | "geo_bubble"
  | "map"
  | "histogram"
  | "table";

export type GeoMapFeatureDto = {
  id?: string;
  label?: string;
  value?: number | null;
  lat?: number | null;
  lon?: number | null;
};

export interface ChartGeoMetadata {
  geoEnabled?: boolean;
  geoDimension?: string | null;
  mapScope?: string | null;
  fallbackChartType?: ChartKind | null;
  /** Нормализованные точки для будущей карты (MVP). */
  mapFeatures?: GeoMapFeatureDto[];
}

export interface BlockBase {
  id: string;
  status?: CellRunStatus;
  errorMessage?: string;
}

export interface PromptBlock extends BlockBase {
  type: "prompt";
  text: string;
}

export interface SqlBlock extends BlockBase {
  type: "sql";
  sql: string;
  dialect?: string;
  /** SQL passed static validation / lint */
  validated?: boolean;
}

export interface TableBlock extends BlockBase {
  type: "table";
  columns: string[];
  rows: Record<string, string | number>[];
  caption?: string;
}

export interface ChartBlock extends BlockBase {
  type: "chart";
  /** User-selected chart type (mutable in UI). */
  chartType: ChartKind;
  /** Backend recommendation (immutable baseline). */
  recommendedChartType?: ChartKind;
  alternativeChartTypes?: ChartKind[];
  visualizationExplanation?: string;
  geoMetadata?: ChartGeoMetadata | null;
  title?: string;
  subtitle?: string;
  unitLabel?: string;
  sampleSize?: number;
  qualityMetricLabel?: string;
  qualityMetricValue?: number;
  xKey: string;
  series: { key: string; name: string }[];
  data: Record<string, string | number>[];
}

export interface InsightBlock extends BlockBase {
  type: "insight";
  title: string;
  summary?: string;
  bullets: string[];
  /** 0–1 model confidence */
  confidence?: number;
}

export interface ClarificationBlock extends BlockBase {
  type: "clarification";
  prompt: string;
  options?: { id: string; label: string }[];
  selectedOptionId?: string;
  /** Код причины с API (например city_scope_ambiguous). */
  reasonCode?: string;
  /** Краткое пояснение «почему неоднозначно» (рус.). */
  reasonSummaryRu?: string;
}

export interface ForecastHistoryPoint {
  period: string;
  value: number;
}

/** Серия «история + прогноз» для одного графика (payload с бэкенда). */
export interface ForecastCombinedPoint {
  idx: number;
  value: number;
  segment: "history" | "forecast";
  label: string;
}

export interface ForecastRecordPoint {
  step: number;
  forecast_value: number;
  forecast_low?: number;
  forecast_high?: number;
}

export interface ForecastBlock extends BlockBase {
  type: "forecast";
  /** Источник прогноза в UI: основной pipeline или DS fallback sidecar. */
  forecastSource?: "pipeline" | "fallback";
  headline: string;
  subtext?: string;
  horizon: string;
  baseline?: number;
  optimistic?: number;
  pessimistic?: number;
  unit?: string;
  /** Серия baseline-прогноза (если пришла с бэкенда). */
  records?: ForecastRecordPoint[];
  explanationRu?: string;
  warningRu?: string | null;
  confidenceScore?: number;
  history?: ForecastHistoryPoint[];
  rSquared?: number;
  metricColumn?: string;
  backtestNoteRu?: string;
  /** day | week | month — как агрегирован ряд перед baseline. */
  timeGrain?: string;
  /** Подпись источника ряда (например public.train). */
  sourceTableLabel?: string;
  combinedSeries?: ForecastCombinedPoint[];
}

/** Compact inline trace / plan cell (full detail lives in TracePanel) */
export interface TraceBlock extends BlockBase {
  type: "trace";
  summary: string;
  intent?: string;
  tables?: string[];
}

export type NotebookBlock =
  | PromptBlock
  | SqlBlock
  | TableBlock
  | ChartBlock
  | InsightBlock
  | ClarificationBlock
  | ForecastBlock
  | TraceBlock;

export type TraceStepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface TraceStep {
  id: string;
  label: string;
  detail?: string;
  status: TraceStepStatus;
}

export interface TraceLogLine {
  level: "info" | "warn" | "error";
  message: string;
  at?: string;
}

export type TraceValidationStatus = "pending" | "passed" | "failed" | "unknown";

export interface TraceSemanticTerm {
  termKey: string;
  surfaceForm: string;
  sqlFragment: string;
  confidence: number;
}

export interface TraceChartRecommendation {
  chartType: string;
  rationale: string;
  alternatives: string[];
  /** 0–1, с бэкенда `chart_recommendation.confidence` / visualization_confidence */
  confidence?: number;
  axesHint?: string;
  seriesKeys?: string[];
}

export interface TracePanelModel {
  schemaVersion: 1;
  /** ru | en — эвристика с бэкенда */
  languageDetected?: string;
  /** Краткое резюме role policy (RU) */
  rolePolicySummaryRu?: string;
  interpretedIntent: string;
  structuredInterpretation: Record<string, unknown>;
  interpretationSummaryRu?: string;
  interpretationNotes: string[];
  sqlGuardrails: Record<string, unknown>;
  extractedEntities: Record<string, unknown>;
  semanticTerms: TraceSemanticTerm[];
  tablesUsed: string[];
  resultColumns: string[];
  generatedSql: string;
  validationStatus: TraceValidationStatus;
  warnings: string[];
  confidence: number;
  clarificationRequested: boolean;
  clarificationReason?: string;
  clarificationReasonSummaryRu?: string;
  clarificationQuestion?: string;
  followUpContextUsed: boolean;
  learnedCorrectionUsed: boolean;
  chartRecommendation: TraceChartRecommendation;
  forecastModeActive: boolean;
  forecastMethod: string | null;
  forecastSelection: {
    metricKey: string | null;
    selectedStrategy: string | null;
    dataQuality: Record<string, unknown>;
    backtestSummary: Record<string, unknown>;
  };
  /** Сырой блок explainability прогноза (snake_case с API). */
  forecastExplainability: Record<string, unknown>;
  qualityGate: {
    status: "passed" | "warning" | "failed";
    reasons: string[];
  };
  guardrails: {
    blocked: boolean;
    codes: string[];
    messagesRu: string[];
  };
  /** Optional pipeline timeline (demo / extended diagnostics). */
  steps: TraceStep[];
  logs: TraceLogLine[];
  /** Поверхность данных после enrich контекста (см. POST /analytics/run `resolved_source_table`). */
  resolvedSourceTable?: string;
}

/** NotebookHeader */
export interface NotebookHeaderProps {
  title: string;
  subtitle?: string;
  notebookId: string;
  updatedAtLabel?: string;
  /** High-level run state for the whole notebook */
  runState?: "idle" | "running" | "failed";
  /** Shown under the title while the pipeline is busy (client-side hint until ответ API). */
  runPhaseHint?: string | null;
  /** Extra controls (e.g. trace toggle injected by parent) */
  trailing?: ReactNode;
}

/** NotebookCanvas — main column + optional trace column */
export interface NotebookCanvasProps {
  children: ReactNode;
  trace: ReactNode;
  traceOpen: boolean;
  traceWidthClassName?: string;
}

/** Wrapper: index gutter + chrome */
export interface NotebookCellProps {
  index: number;
  block: NotebookBlock;
  onRunCell?: (id: string) => void;
  onChartTypeChange?: (id: string, chartType: ChartKind) => void;
  onPromptChange?: (id: string, text: string) => void;
  onPromptSubmit?: (id: string, text: string) => void;
  onClarificationSelect?: (id: string, optionId: string, optionLabel: string) => void;
  clarificationBusy?: boolean;
}

export interface PromptCellProps {
  block: PromptBlock;
  onChange?: (text: string) => void;
  onSubmit?: (text: string) => void;
  disabled?: boolean;
}

export interface SqlCellProps {
  block: SqlBlock;
}

export interface TableCellProps {
  block: TableBlock;
}

export interface ChartCellProps {
  block: ChartBlock;
  onTypeChange?: (chartType: ChartKind) => void;
}

export interface InsightCellProps {
  block: InsightBlock;
}

export interface ClarificationCellProps {
  block: ClarificationBlock;
  onSelectOption?: (optionId: string, optionLabel: string) => void;
  disabled?: boolean;
}

export interface ForecastCellProps {
  block: ForecastBlock;
}

export interface TracePanelProps {
  model: TracePanelModel;
  onClose?: () => void;
  className?: string;
  /** Текст последнего промпта в канве — для перезапуска из trace с опциями. */
  lastPromptText?: string | null;
  traceActionBusy?: boolean;
  onTraceRerun?: (opts: NotebookAnalyticsRunOptions) => void | Promise<void>;
  onScrollToClarification?: () => void;
}

export interface ConfidenceBadgeProps {
  value: number;
  className?: string;
  /** Компактный вид: только проценты, меньше отступы (для сводок trace). */
  compact?: boolean;
}

export interface ValidationBadgeProps {
  ok: boolean;
  label?: string;
  className?: string;
  /** Компактный вид для плотных карточек. */
  compact?: boolean;
  /** Для ошибок валидации — красная семантика вместо предупреждающей. */
  danger?: boolean;
}

export interface ChartTypeSwitcherProps {
  value: ChartKind;
  onChange: (next: ChartKind) => void;
  options?: ChartKind[];
  className?: string;
}

export interface AddCellComposerProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  error?: string | null;
}

export interface RunCellButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

export interface RunAllButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}
