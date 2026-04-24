"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDashboardSuggestions } from "@/lib/api/dashboard";
import { queryKeys } from "@/hooks/api/query-keys";
import type { UserRole } from "@/lib/types";

export function useDashboardSuggestions(workspaceId: string | undefined, role?: UserRole) {
  return useQuery({
    queryKey: queryKeys.dashboard.suggestions(workspaceId, role),
    queryFn: () => fetchDashboardSuggestions(workspaceId, role),
    enabled: Boolean(workspaceId && workspaceId.length >= 8),
    staleTime: 60_000
  });
}
