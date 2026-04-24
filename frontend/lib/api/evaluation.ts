import { ApiError, apiFetchJson } from "@/lib/api/client";
import type {
  CaseEvaluationResultDto,
  EvaluationMode,
  GoldenCasePublic,
  NlSqlEvalRunResponse,
  NlSqlEvalSummary,
  SqlCorrectnessCasePublic,
  SqlCorrectnessRunResponse,
  SqlCorrectnessSummary
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
