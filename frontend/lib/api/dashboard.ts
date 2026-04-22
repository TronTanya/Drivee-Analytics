import { requestJson } from "@/lib/api/request";
import { mockDashboardSuggestions } from "@/lib/api/mocks";
import type { DashboardSuggestionsResponseDto } from "@/types/api/dashboard";
import type { UserRole } from "@/lib/types";

export async function fetchDashboardSuggestions(role?: UserRole): Promise<DashboardSuggestionsResponseDto> {
  const q = role ? `?role=${encodeURIComponent(role)}` : "";
  return requestJson({
    path: `/api/v1/dashboard/suggestions${q}`,
    init: { method: "GET", cache: "no-store" },
    mock: () => mockDashboardSuggestions()
  });
}
