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
