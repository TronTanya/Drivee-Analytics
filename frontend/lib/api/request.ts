import { ApiError, apiFetchJson } from "@/lib/api/client";
import { isApiMockFallback, isApiMockOnly } from "@/lib/api/config";

export type RequestJsonOptions<T> = {
  path: string;
  init?: RequestInit;
  /** Called when mock-only or when fallback catches a failure */
  mock: () => T | Promise<T>;
  /** Optional runtime hook for explicit fallback/mock telemetry in UI. */
  onMockUsed?: (mode: "mock-only" | "fallback") => void;
  /** Disable fallback-to-mock for strict live endpoints */
  allowFallback?: boolean;
};

function shouldFallbackToMock(error: unknown): boolean {
  if (!isApiMockFallback()) return false;
  if (error instanceof TypeError) return true;
  if (error instanceof ApiError) {
    // Demo mode: allow mock fallback when auth isn't wired yet.
    return error.status >= 500 || error.status === 404 || error.status === 401 || error.status === 403;
  }
  return false;
}

/**
 * Typed JSON request with optional mock / fallback behaviour (see lib/api/config.ts).
 */
export async function requestJson<T>(opts: RequestJsonOptions<T>): Promise<T> {
  if (isApiMockOnly()) {
    opts.onMockUsed?.("mock-only");
    return opts.mock();
  }
  try {
    return await apiFetchJson<T>(opts.path, opts.init);
  } catch (e) {
    if (opts.allowFallback !== false && shouldFallbackToMock(e)) {
      opts.onMockUsed?.("fallback");
      if (process.env.NODE_ENV === "development") {
        console.warn("[api] mock fallback:", opts.path, e instanceof ApiError ? e.status : e);
      }
      return opts.mock();
    }
    throw e;
  }
}
