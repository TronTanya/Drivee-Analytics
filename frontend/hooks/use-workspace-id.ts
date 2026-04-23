"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/lib/api/auth";

const LS_KEY = "drivee.default_workspace_id.v1";

export function useWorkspaceId() {
  return useQuery({
    queryKey: ["auth", "default-workspace-id"],
    queryFn: async () => {
      try {
        const u = await fetchCurrentUser();
        const fromApi = (u.default_workspace_id || u.workspace_id || "").trim();
        if (fromApi) {
          try {
            window.localStorage.setItem(LS_KEY, fromApi);
          } catch {
            /* ignore */
          }
          return fromApi;
        }
      } catch {
        /* fall through */
      }
      if (typeof window !== "undefined") {
        try {
          const cached = window.localStorage.getItem(LS_KEY)?.trim();
          if (cached) return cached;
        } catch {
          /* ignore */
        }
      }
      const env = (process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID || "").trim();
      return env || "";
    },
    staleTime: 120_000
  });
}
