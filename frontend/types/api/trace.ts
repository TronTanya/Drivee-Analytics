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

export type AnalyticsExplainabilityTraceV1Dto = {
  schema_version: 1;
  interpreted_intent: string;
  extracted_entities: Record<string, unknown>;
  semantic_terms: AnalyticsSemanticTermDto[];
  tables_used: string[];
  result_columns: string[];
  generated_sql: string;
  validation_status: "pending" | "passed" | "failed" | "unknown";
  warnings: string[];
  confidence: number;
  clarification_requested: boolean;
  follow_up_context_used: boolean;
  learned_correction_used: boolean;
  chart_recommendation: AnalyticsChartRecommendationDto;
  forecast_mode: AnalyticsForecastModeDto;
  forecast_selection: AnalyticsForecastSelectionDto;
  quality_gate: AnalyticsQualityGateDto;
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
