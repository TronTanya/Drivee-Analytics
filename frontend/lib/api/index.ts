/** Config & transport */
export {
  getDemoApiMode,
  isApiMockFallback,
  isApiMockOnly,
  isDemoModeEnabled,
  shouldForceAnalyticsMock
} from "@/lib/api/config";
export { apiFetch, apiFetchJson, ApiError, getApiBaseUrl } from "@/lib/api/client";
export { requestJson } from "@/lib/api/request";
export {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
  setTokenPair
} from "@/lib/api/token";

/** Domains */
export * from "@/lib/api/auth";
export * from "@/lib/api/notebooks";
export * from "@/lib/api/cells";
export * from "@/lib/api/reports";
export * from "@/lib/api/schedules";
export * from "@/lib/api/templates";
export * from "@/lib/api/history";
export * from "@/lib/api/dictionary";
export * from "@/lib/api/data-upload";
export * from "@/lib/api/forecast";
export * from "@/lib/api/dashboard";
export * from "@/lib/api/corrections";

/** Back-compat name */
export { runAnalyticsPipeline } from "@/lib/api/analytics";
