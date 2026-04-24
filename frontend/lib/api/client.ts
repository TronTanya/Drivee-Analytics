import { getAccessToken } from "@/lib/api/token";

const DEFAULT_BASE = "http://localhost:8000";

/**
 * База для fetch:
 * - `NEXT_PUBLIC_API_URL` задан явно (не same-origin) → прямой вызов бэкенда.
 * - `same-origin` или пусто → в браузере пустая строка (пути `/api/...` идут в Next rewrites).
 * - На сервере (RSC и т.п.) → INTERNAL_API_URL или дефолт localhost:8000.
 */
export function getApiBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
  const useSameOrigin = !raw || raw.toLowerCase() === "same-origin";
  if (useSameOrigin) {
    if (typeof window !== "undefined") {
      return "";
    }
    const internal = (process.env.INTERNAL_API_URL || DEFAULT_BASE).trim().replace(/\/$/, "");
    return internal;
  }
  return raw.replace(/\/$/, "");
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getApiBaseUrl().replace(/\/$/, "");
  const url = path.startsWith("http")
    ? path
    : base
      ? `${base}${path.startsWith("/") ? path : `/${path}`}`
      : path.startsWith("/")
        ? path
        : `/${path}`;

  const headers = new Headers(init.headers);
  if (typeof window !== "undefined") {
    const token = getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  if (
    init.body != null &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  /* FormData: let browser set multipart boundary */

  return fetch(url, { ...init, headers });
}

function parseErrorBody(text: string): { message: string; code?: string } {
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const detail = j.detail;
    if (Array.isArray(detail)) {
      const parts = detail.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: string }).msg ?? item);
        }
        return JSON.stringify(item);
      });
      const message = parts.filter(Boolean).join("; ") || "Request failed";
      return { message, code: typeof j.code === "string" ? j.code : undefined };
    }
    if (typeof detail === "string") {
      return { message: detail, code: typeof j.code === "string" ? j.code : undefined };
    }
    const message = (typeof j.message === "string" ? j.message : undefined) ?? (typeof j.error === "string" ? j.error : undefined) ?? text;
    return { message: message || "Request failed", code: typeof j.code === "string" ? j.code : undefined };
  } catch {
    return { message: text || "Request failed" };
  }
}

export async function apiFetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  const text = await res.text();
  if (!res.ok) {
    const parsed = parseErrorBody(text);
    throw new ApiError(parsed.message, res.status, text, parsed.code);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}
