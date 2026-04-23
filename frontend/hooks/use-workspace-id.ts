"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchCurrentUser } from "@/lib/api/auth";

const LS_KEY = "drivee.default_workspace_id.v1";
const UUID_V4_OR_V1_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeWorkspaceId(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  // Backend принимает UUID; некорректные id (например, legacy "ws-1") считаем пустыми.
  return UUID_V4_OR_V1_RE.test(trimmed) ? trimmed : "";
}

export function useWorkspaceId() {
  return useQuery({
    queryKey: ["auth", "default-workspace-id"],
    queryFn: async () => {
      try {
        const u = await fetchCurrentUser();
        const fromApi = normalizeWorkspaceId(u.default_workspace_id || u.workspace_id || "");
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
          const cached = normalizeWorkspaceId(window.localStorage.getItem(LS_KEY));
          if (cached) return cached;
        } catch {
          /* ignore */
        }
      }
      const env = normalizeWorkspaceId(process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID || "");
      if (env) return env;
      return "";
    },
    staleTime: 120_000
  });
}
