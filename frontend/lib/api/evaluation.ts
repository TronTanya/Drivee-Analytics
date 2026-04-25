import { ApiError, apiFetchJson } from "@/lib/api/client";
import type {
  CaseEvaluationResultDto,
  DemoReadinessDto,
  EvaluationMode,
  GoldenCasePublic,
  GuardrailsRunResponse,
  NlSqlEvalRunResponse,
  NlSqlEvalSummary,
  NlSqlGoldenEvalSummaryDto,
  PromptStabilityResponse,
  QualityCenterOverview,
  QualityLastRunBundle,
  RepairBriefLatestResponse,
  SqlCorrectnessCasePublic,
  SqlCorrectnessRunResponse,
  SqlCorrectnessSummary,
  UnderstandingRunResponse,
  VisualizationRunResponse
} from "@/types/api/evaluation";

export async function fetchNlSqlEvalCases(): Promise<GoldenCasePublic[]> {
  return apiFetchJson<GoldenCasePublic[]>("/api/v1/evaluation/nl-sql/cases");
}

export async function fetchNlSqlEvalSummary(mode: EvaluationMode = "mock"): Promise<NlSqlEvalSummary> {
  const q = new URLSearchParams({ mode });
  return apiFetchJson<NlSqlEvalSummary>(`/api/v1/evaluation/nl-sql/summary?${q.toString()}`);
}

export async function runNlSqlEvaluation(mode: EvaluationMode = "mock"): Promise<NlSqlEvalRunResponse> {
  return apiFetchJson<NlSqlEvalRunResponse>("/api/v1/evaluation/nl-sql/run", {
    method: "POST",
    body: JSON.stringify({ mode })
  });
}

export function isNlSqlEvalAuthError(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403);
}

export async function fetchSqlCorrectnessCases(): Promise<SqlCorrectnessCasePublic[]> {
  return apiFetchJson<SqlCorrectnessCasePublic[]>("/api/v1/evaluation/sql-correctness/cases");
}

export async function fetchSqlCorrectnessSummary(mode: EvaluationMode = "mock"): Promise<SqlCorrectnessSummary> {
  const q = new URLSearchParams({ mode });
  return apiFetchJson<SqlCorrectnessSummary>(`/api/v1/evaluation/sql-correctness/summary?${q.toString()}`);
}

export async function runSqlCorrectnessEvaluation(mode: EvaluationMode = "mock"): Promise<SqlCorrectnessRunResponse> {
  return apiFetchJson<SqlCorrectnessRunResponse>("/api/v1/evaluation/sql-correctness/run", {
    method: "POST",
    body: JSON.stringify({ mode })
  });
}

export async function fetchQualityCenterSummary(mode: EvaluationMode = "deterministic"): Promise<QualityCenterOverview> {
  const q = new URLSearchParams({ mode });
  return apiFetchJson<QualityCenterOverview>(`/api/v1/quality/summary?${q.toString()}`);
}

export async function fetchNlSqlGoldenEvalSummary(): Promise<NlSqlGoldenEvalSummaryDto> {
  return apiFetchJson<NlSqlGoldenEvalSummaryDto>("/api/v1/quality/nl-sql-golden-summary");
}

export async function fetchDemoReadiness(): Promise<DemoReadinessDto> {
  return apiFetchJson<DemoReadinessDto>("/api/v1/demo/readiness");
}

export async function runQualityCenterEvaluation(
  mode: EvaluationMode = "deterministic",
  suites?: string[]
): Promise<QualityCenterOverview> {
  return apiFetchJson<QualityCenterOverview>("/api/v1/evaluation/quality/run", {
    method: "POST",
    body: JSON.stringify({ mode, suites: suites ?? undefined })
  });
}

export async function fetchQualityLastRunDetails(mode: EvaluationMode = "deterministic"): Promise<QualityLastRunBundle> {
  const q = new URLSearchParams({ mode });
  return apiFetchJson<QualityLastRunBundle>(`/api/v1/evaluation/quality/last-run-details?${q.toString()}`);
}

export async function fetchRepairBriefLatest(): Promise<RepairBriefLatestResponse> {
  return apiFetchJson<RepairBriefLatestResponse>("/api/v1/evaluation/quality/repair-brief/latest");
}

export async function runUnderstandingEvaluation(mode: EvaluationMode = "deterministic"): Promise<UnderstandingRunResponse> {
  return apiFetchJson<UnderstandingRunResponse>("/api/v1/evaluation/understanding/run", {
    method: "POST",
    body: JSON.stringify({ mode })
  });
}

export async function runVisualizationEvaluation(mode: EvaluationMode = "deterministic"): Promise<VisualizationRunResponse> {
  return apiFetchJson<VisualizationRunResponse>("/api/v1/evaluation/visualization/run", {
    method: "POST",
    body: JSON.stringify({ mode })
  });
}

export async function runGuardrailsEvaluation(mode: EvaluationMode = "deterministic"): Promise<GuardrailsRunResponse> {
  return apiFetchJson<GuardrailsRunResponse>("/api/v1/evaluation/guardrails/run", {
    method: "POST",
    body: JSON.stringify({ mode })
  });
}

export async function runPromptStabilityCheck(body: {
  prompt: string;
  runs: number;
  mode: EvaluationMode;
}): Promise<PromptStabilityResponse> {
  return apiFetchJson<PromptStabilityResponse>("/api/v1/evaluation/prompt-stability", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
