import { apiFetchJson, ApiError } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";
import { mockDashboardSuggestions } from "@/lib/api/mocks";
import type { DashboardSuggestionDto, DashboardSuggestionsResponseDto } from "@/types/api/dashboard";
import type { UserRole } from "@/lib/types";

type DashboardSuggestApi = {
  suggest_dashboard: boolean;
  reason: string;
  suggested_widgets: Array<{
    title: string;
    chart_type: string;
    metric_key?: string | null;
    intent?: string | null;
    scenario_key?: string | null;
  }>;
  history_sample_size: number;
  recurring_scenarios: number;
};

function mapSuggestApiToDto(api: DashboardSuggestApi, role?: UserRole): DashboardSuggestionsResponseDto {
  const suggestions: DashboardSuggestionDto[] = api.suggested_widgets.map((w, i) => {
    const sk = (w.scenario_key ?? `i${i}`).replace(/[^a-zA-Z0-9|._-]+/g, "-").slice(0, 64);
    const parts = [w.intent ? `Intent: ${w.intent}` : null, w.chart_type ? `График: ${w.chart_type}` : null].filter(
      Boolean
    ) as string[];
    return {
      id: `w-${i}-${sk}`,
      title: w.title,
      description: parts.length ? parts.join(" · ") : "Сценарий из истории запросов в ноутбуке",
      href: "/notebooks/ops-health",
      role: role ?? "manager",
      kind: "template"
    };
  });
  return { suggestions };
}

export async function fetchDashboardSuggestions(
  workspaceId: string | undefined,
  role?: UserRole
): Promise<DashboardSuggestionsResponseDto> {
  if (isApiMockOnly()) {
    return mockDashboardSuggestions();
  }
  if (!workspaceId?.trim()) {
    return { suggestions: [] };
  }
  const path = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/dashboards/suggest?days_back=90&limit=200`;
  try {
    const api = await apiFetchJson<DashboardSuggestApi>(path, { method: "GET", cache: "no-store" });
    return mapSuggestApiToDto(api, role);
  } catch (e) {
    if (
      isApiMockFallback() &&
      (e instanceof TypeError ||
        (e instanceof ApiError && (e.status >= 500 || e.status === 404 || e.status === 401 || e.status === 403)))
    ) {
      return mockDashboardSuggestions();
    }
    throw e;
  }
}
