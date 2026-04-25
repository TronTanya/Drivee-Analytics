export type EvaluationMode = "live" | "mock" | "deterministic";

export type CaseChecks = {
  intent: boolean;
  metric: boolean;
  dimensions: boolean;
  time_range: boolean;
  chart_type: boolean;
  clarification: boolean;
  guardrail: boolean;
  sql_contains: boolean;
  sql_safety: boolean;
};

export type NlSqlEvalSummary = {
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  overall_accuracy: number;
  intent_accuracy: number;
  metric_accuracy: number;
  dimension_accuracy: number;
  time_range_accuracy: number;
  chart_accuracy: number;
  clarification_accuracy: number;
  guardrail_accuracy: number;
  sql_validation_pass_rate: number;
  confidence_average: number;
  updated_at: string;
  mode: EvaluationMode;
  deterministic_eval: boolean;
};

export type GoldenCasePublic = {
  id: string;
  category: string;
  prompt: string;
  role: string;
};

export type CaseEvaluationResultDto = {
  id: string;
  prompt: string;
  category: string;
  passed: boolean;
  score: number;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  checks: CaseChecks;
  failure_reason?: string | null;
};

export type NlSqlEvalRunResponse = {
  summary: NlSqlEvalSummary;
  case_results: CaseEvaluationResultDto[];
};

export type SqlCorrectnessChecks = {
  fragments: boolean;
  forbidden: boolean;
  tables: boolean;
  gold_normalized: boolean;
  scalar_live: boolean;
  sql_validation: boolean;
  generated_non_empty: boolean;
};

export type SqlCorrectnessSummary = {
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  overall_accuracy: number;
  fragment_pass_rate: number;
  table_pass_rate: number;
  gold_exact_pass_rate: number;
  live_scalar_pass_rate: number;
  live_scalar_coverage: number;
  sql_validation_pass_rate: number;
  updated_at: string;
  mode: EvaluationMode;
};

export type SqlCorrectnessCasePublic = {
  id: string;
  prompt: string;
  role: string;
};

export type SqlCorrectnessCaseResultDto = {
  id: string;
  prompt: string;
  passed: boolean;
  score: number;
  checks: SqlCorrectnessChecks;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  failure_reason?: string | null;
};

export type SqlCorrectnessRunResponse = {
  summary: SqlCorrectnessSummary;
  case_results: SqlCorrectnessCaseResultDto[];
};

/** Drivee Quality Center — агрегат по suite (см. GET /evaluation/quality/summary). */
export type QualitySuiteSummary = {
  suite: string;
  total_cases: number;
  passed_cases: number;
  overall_accuracy: number;
  mode: EvaluationMode;
  extra: Record<string, unknown>;
};

export type QualityCenterOverview = {
  overall_quality_score: number;
  nl_sql_understanding: QualitySuiteSummary;
  sql_correctness: QualitySuiteSummary;
  visualization_match: QualitySuiteSummary;
  guardrails_safety: QualitySuiteSummary;
  updated_at: string;
  mode: EvaluationMode;
};

export type UnderstandingRunResponse = {
  summary: NlSqlEvalSummary;
  case_results: CaseEvaluationResultDto[];
};

export type VisualizationCaseResultDto = {
  id: string;
  prompt: string;
  category: string;
  passed: boolean;
  score: number;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  checks: { chart_type: boolean; result_shape: boolean };
  failure_reason?: string | null;
};

export type VisualizationEvalSummary = {
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  overall_accuracy: number;
  chart_match_rate: number;
  updated_at: string;
  mode: EvaluationMode;
};

export type VisualizationRunResponse = {
  summary: VisualizationEvalSummary;
  case_results: VisualizationCaseResultDto[];
};

export type GuardrailsCaseResultDto = {
  id: string;
  prompt: string;
  category: string;
  passed: boolean;
  score: number;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  checks: { blocked_execution: boolean; reason_signal: boolean };
  failure_reason?: string | null;
};

export type GuardrailsEvalSummary = {
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  overall_accuracy: number;
  updated_at: string;
  mode: EvaluationMode;
};

export type GuardrailsRunResponse = {
  summary: GuardrailsEvalSummary;
  case_results: GuardrailsCaseResultDto[];
};

export type QualityLastRunBundle = {
  mode: EvaluationMode;
  understanding: UnderstandingRunResponse | null;
  sql_correctness: SqlCorrectnessRunResponse | null;
  visualization: VisualizationRunResponse | null;
  guardrails: GuardrailsRunResponse | null;
};

export type RepairBriefLatestResponse = {
  found: boolean;
  run_id?: string;
  overall_quality_score?: number | null;
  repair_brief_md?: string;
};

export type PromptStabilityRow = {
  run_index: number;
  outcome: string;
  clarification_required: boolean;
  execution_status: string;
  sql_preview: string;
  blocked: boolean;
};

export type PromptStabilityResponse = {
  prompt: string;
  runs: number;
  stability_score: number;
  outcomes: Record<string, number>;
  results: PromptStabilityRow[];
};

/** GET /api/v1/quality/nl-sql-golden-summary — файл `evals/results/latest_eval_results.json`. */
export type NlSqlGoldenEvalMetricsDto = {
  nl_sql_accuracy: number;
  sql_safety: number;
  chart_accuracy: number;
  clarification_accuracy: number;
  trace_completeness: number;
};

export type NlSqlGoldenEvalCaseRowDto = {
  id: string;
  question: string;
  expected_status: string;
  actual_status: string;
  chart: string;
  guardrails: string;
  passed: boolean;
};

export type DemoReadinessDto = {
  status: "ready" | "degraded" | "not_ready";
  checks: Record<string, "ok" | "fail" | "warn" | "skipped">;
  score: number;
};

export type NlSqlGoldenEvalSummaryDto = {
  total_cases: number;
  passed_cases: number;
  score: number;
  metrics: NlSqlGoldenEvalMetricsDto;
  cases: NlSqlGoldenEvalCaseRowDto[];
  generated_at?: string | null;
  mode?: string | null;
  source: string;
};
