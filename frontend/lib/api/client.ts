import { getAccessToken } from "@/lib/api/token";

const DEFAULT_BASE = "http://localhost:8000";

export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_BASE;
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
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;

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
    const j = JSON.parse(text) as { message?: string; error?: string; code?: string };
    const message = j.message ?? j.error ?? text;
    return { message: message || "Request failed", code: j.code };
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
