import type { UserRole } from "@/lib/types";

export const queryKeys = {
  auth: {
    all: ["auth"] as const,
    me: () => [...queryKeys.auth.all, "me"] as const
  },
  notebooks: {
    all: ["notebooks"] as const,
    list: () => [...queryKeys.notebooks.all, "list"] as const,
    detail: (id: string) => [...queryKeys.notebooks.all, "detail", id] as const,
    cells: (id: string) => [...queryKeys.notebooks.all, "cells", id] as const
  },
  reports: {
    all: ["reports"] as const,
    saved: () => [...queryKeys.reports.all, "saved"] as const,
    detail: (id: string) => [...queryKeys.reports.all, "detail", id] as const,
    scenarios: () => [...queryKeys.reports.all, "scenarios"] as const
  },
  templates: {
    all: ["templates"] as const,
    queries: () => [...queryKeys.templates.all, "queries"] as const,
    notebooks: () => [...queryKeys.templates.all, "notebooks"] as const
  },
  history: {
    all: ["history"] as const,
    notebookRuns: () => [...queryKeys.history.all, "notebook-runs"] as const,
    queries: () => [...queryKeys.history.all, "queries"] as const
  },
  dictionary: {
    all: ["dictionary"] as const,
    entries: () => [...queryKeys.dictionary.all, "entries"] as const
  },
  dashboard: {
    all: ["dashboard"] as const,
    suggestions: (workspaceId: string | undefined, role?: UserRole) =>
      [...queryKeys.dashboard.all, "suggestions", workspaceId ?? "none", role ?? "any"] as const
  },
  corrections: {
    all: ["corrections"] as const,
    list: (workspaceId: string | undefined) => [...queryKeys.corrections.all, "list", workspaceId ?? "none"] as const
  }
} as const;
