/** Wire shape for POST /api/v1/analytics/run `trace` — matches backend AnalyticsExplainabilityTraceV1. */

export type AnalyticsSemanticTermDto = {
  term_key: string;
  surface_form: string;
  sql_fragment: string;
  confidence: number;
};

export type AnalyticsChartRecommendationDto = {
  chart_type: string;
  rationale: string;
  alternatives: string[];
  confidence?: number;
  axes_hint?: string;
  series_keys?: string[];
};

export type AnalyticsForecastModeDto = {
  active: boolean;
  method: string | null;
};

export type AnalyticsForecastSelectionDto = {
  metric_key: string | null;
  selected_strategy: string | null;
  backtest_summary: Record<string, unknown>;
  data_quality: Record<string, unknown>;
};

export type AnalyticsQualityGateDto = {
  status: "passed" | "warning" | "failed";
  reasons: string[];
};

export type AnalyticsExecutionPhaseDto = {
  phase_id: string;
  label: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  detail?: string;
};

export type AnalyticsGuardrailsDto = {
  blocked: boolean;
  codes: string[];
  messages_ru: string[];
};

export type AnalyticsExplainabilityTraceV1Dto = {
  schema_version: 1;
  language_detected?: string;
  role_policy_result_ru?: string;
  interpreted_intent: string;
  structured_interpretation?: Record<string, unknown>;
  interpretation_summary_ru?: string;
  interpretation_notes?: string[];
  sql_guardrails?: Record<string, unknown>;
  extracted_entities: Record<string, unknown>;
  semantic_terms: AnalyticsSemanticTermDto[];
  tables_used: string[];
  result_columns: string[];
  generated_sql: string;
  validation_status: "pending" | "passed" | "failed" | "unknown";
  warnings: string[];
  confidence: number;
  clarification_requested: boolean;
  /** Почему трактовка неоднозначна (с бэкенда, без «угадайки»). */
  clarification_reason?: string;
  /** Краткое пояснение причины на русском (если пришло с API). */
  clarification_reason_summary_ru?: string;
  /** Конкретный вопрос пользователю. */
  clarification_question?: string;
  follow_up_context_used: boolean;
  learned_correction_used: boolean;
  chart_recommendation: AnalyticsChartRecommendationDto;
  forecast_mode: AnalyticsForecastModeDto;
  forecast_selection: AnalyticsForecastSelectionDto;
  /** Baseline-прогноз: объяснение, предупреждения, история (MVP). */
  forecast_explainability?: Record<string, unknown>;
  quality_gate: AnalyticsQualityGateDto;
  execution_phases?: AnalyticsExecutionPhaseDto[];
  guardrails?: AnalyticsGuardrailsDto;
};

/** Older analytics responses (pre explainability v1). */
export type AnalyticsTraceLegacyDto = {
  confidence: number;
  warnings: string[];
  used_tables: string[];
  used_columns: string[];
};

export type AnalyticsTraceDto = AnalyticsExplainabilityTraceV1Dto | AnalyticsTraceLegacyDto;

export function isExplainabilityTraceV1(trace: AnalyticsTraceDto): trace is AnalyticsExplainabilityTraceV1Dto {
  return (
    typeof trace === "object" &&
    trace !== null &&
    "schema_version" in trace &&
    (trace as AnalyticsExplainabilityTraceV1Dto).schema_version === 1
  );
}
