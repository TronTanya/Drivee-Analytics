import type { UserRole } from "@/lib/types";

export type DashboardSuggestionDto = {
  id: string;
  title: string;
  description: string;
  href: string;
  role: UserRole;
  kind: "notebook" | "report" | "template" | "query";
};

export type DashboardSuggestionsResponseDto = {
  suggestions: DashboardSuggestionDto[];
};
