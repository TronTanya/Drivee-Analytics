"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchDashboardSuggestions } from "@/lib/api/dashboard";
import { queryKeys } from "@/hooks/api/query-keys";
import type { UserRole } from "@/lib/types";

export function useDashboardSuggestions(role?: UserRole) {
  return useQuery({
    queryKey: queryKeys.dashboard.suggestions(role),
    queryFn: () => fetchDashboardSuggestions(role),
    staleTime: 60_000
  });
}
