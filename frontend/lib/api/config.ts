/**
 * NEXT_PUBLIC_API_URL — backend origin, либо same-origin (прокси через Next, см. next.config.mjs).
 * NEXT_PUBLIC_DEMO_MODE:
 *   - "1" | "true"  — robust demo profile enabled
 *   - unset / other — regular profile
 * NEXT_PUBLIC_API_MOCK:
 *   - unset / "0" / "false" — live only
 *   - "1" | "true" | "all" — always use client mocks (no network)
 *   - "fallback" — try live; on network failure or 5xx/404 use mocks
 * NEXT_PUBLIC_DEMO_FORCE_ANALYTICS_MOCK:
 *   - "1" | "true" — всегда мок для `/api/v1/analytics/run` (офлайн-режим, не «честный» live)
 *   - unset / "0" / "false" — при DEMO_MODE по умолчанию идём в live backend, fallback только при ошибке (см. NEXT_PUBLIC_API_MOCK)
 */
export function isDemoModeEnabled(): boolean {
  const v = process.env.NEXT_PUBLIC_DEMO_MODE?.toLowerCase();
  return v === "1" || v === "true";
}

export type DemoApiMode = "live" | "fallback" | "mock";

export function getDemoApiMode(): DemoApiMode {
  if (isApiMockOnly()) return "mock";
  if (isApiMockFallback()) return "fallback";
  return "live";
}

export function shouldForceAnalyticsMock(): boolean {
  const v = process.env.NEXT_PUBLIC_DEMO_FORCE_ANALYTICS_MOCK?.toLowerCase();
  if (v === "1" || v === "true") return true;
  return false;
}

export function isApiMockOnly(): boolean {
  const v = process.env.NEXT_PUBLIC_API_MOCK?.toLowerCase();
  return v === "1" || v === "true" || v === "all";
}

export function isApiMockFallback(): boolean {
  const raw = process.env.NEXT_PUBLIC_API_MOCK?.toLowerCase().trim() ?? "";
  const v = raw === "" || raw === "false" || raw === "0" ? "" : raw;
  if (v === "fallback") return true;
  // В demo без явного live-only — подстраховка моком при 401/5xx (docker задаёт API_MOCK=false → "0").
  if (!v && isDemoModeEnabled()) return true;
  return false;
}
